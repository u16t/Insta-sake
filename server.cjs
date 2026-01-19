require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodeCron = require('node-cron');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const OpenAI = require('openai');
const sharp = require('sharp');
const FormData = require('form-data');
const cloudinary = require('cloudinary').v2;

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const port = process.env.PORT || 3001;
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database setup
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ posts: [] }).write();

function prunePosts(limit = 100) {
    const posts = db.get('posts').value();
    if (!Array.isArray(posts) || posts.length <= limit) return;

    const sorted = [...posts].sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : Number(a?.id || 0);
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : Number(b?.id || 0);
        return ta - tb;
    });
    const toRemove = sorted.slice(0, Math.max(0, sorted.length - limit));
    toRemove.forEach(item => {
        if (item?.id !== undefined) db.get('posts').remove({ id: item.id }).write();
    });
}

// Prune on startup
prunePosts(100);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Health check for uptime monitors
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// Simple token-based authentication
const crypto = require('crypto');
let authToken = null;

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
        // No password set, skip auth
        return next();
    }
    const token = req.headers['x-auth-token'];
    if (!token || token !== authToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const appPassword = process.env.APP_PASSWORD;
    
    if (!appPassword) {
        // No password configured, auto-login
        authToken = generateToken();
        return res.json({ success: true, token: authToken });
    }
    
    if (password === appPassword) {
        authToken = generateToken();
        return res.json({ success: true, token: authToken });
    }
    
    res.status(401).json({ error: 'Invalid password' });
});

app.get('/api/auth-status', (req, res) => {
    const appPassword = process.env.APP_PASSWORD;
    res.json({ 
        authRequired: !!appPassword,
        authenticated: !appPassword || (req.headers['x-auth-token'] === authToken && authToken !== null)
    });
});

// Multer setup for image storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Initialize OpenAI (Client will be re-instantiated if key changes)
let openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function removeBackgroundBuffer(imagePath) {
    if (!process.env.REMOVE_BG_API_KEY) {
        throw new Error('Remove.bg API Key not configured');
    }

    const formData = new FormData();
    formData.append('image_file', fs.createReadStream(imagePath));
    formData.append('size', 'auto');

    try {
        const removeBgResp = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
            headers: {
                ...formData.getHeaders(),
                'X-Api-Key': process.env.REMOVE_BG_API_KEY
            },
            responseType: 'arraybuffer'
        });

        return Buffer.from(removeBgResp.data);
    } catch (error) {
        let message = 'Remove.bg request failed';
        const buffer = error?.response?.data;
        if (Buffer.isBuffer(buffer)) {
            try {
                const parsed = JSON.parse(buffer.toString('utf8'));
                const title = parsed?.errors?.[0]?.title;
                const code = parsed?.errors?.[0]?.code;
                if (title || code) {
                    message = `${title || 'Remove.bg error'}${code ? ` (${code})` : ''}`;
                }
            } catch (e) {
                // keep default message
            }
        } else if (error?.response?.data?.errors?.[0]) {
            const { title, code } = error.response.data.errors[0];
            if (title || code) {
                message = `${title || 'Remove.bg error'}${code ? ` (${code})` : ''}`;
            }
        } else if (error?.message) {
            message = error.message;
        }
        throw new Error(message);
    }
}

async function ensureImageUrlIsValid(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Image URL is missing');
    }
    if (!imageUrl.startsWith('https://')) {
        throw new Error('Public URL must be https and publicly accessible');
    }
    if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
        throw new Error('Image URL is not publicly accessible (localhost)');
    }

    const resp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        validateStatus: status => status >= 200 && status < 400
    });
    const contentType = resp.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
        throw new Error(`Image URL is not an image (content-type: ${contentType || 'unknown'})`);
    }
}

// API Endpoints (protected)
app.get('/api/config', requireAuth, (req, res) => {
    // Read directly from .env file to get latest values
    let envConfig = {};
    try {
        if (fs.existsSync('.env')) {
            const envContent = fs.readFileSync('.env', 'utf8');
            envContent.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) {
                    envConfig[key.trim()] = value.trim();
                }
            });
        } else {
            envConfig = process.env;
        }
    } catch (e) {
        console.error('Error reading .env', e);
        // fallback to process.env if file read fails
        envConfig = process.env;
    }

    res.json({
        hasConfig: !!(envConfig.ACCESS_TOKEN || process.env.ACCESS_TOKEN),
        accessToken: envConfig.ACCESS_TOKEN || process.env.ACCESS_TOKEN || '',
        instagramId: envConfig.INSTAGRAM_USER_ID || process.env.INSTAGRAM_USER_ID || '',
        publicUrl: envConfig.BASE_URL || process.env.BASE_URL || '',
        openAiKey: envConfig.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
        removeBgKey: envConfig.REMOVE_BG_API_KEY || process.env.REMOVE_BG_API_KEY || ''
    });
});

app.post('/api/config', requireAuth, (req, res) => {
    const { accessToken, instagramId, publicUrl, openAiKey, removeBgKey } = req.body;

    // Read existing to preserve other keys if any
    let envConfig = {};
    try {
        if (fs.existsSync('.env')) {
            const raw = fs.readFileSync('.env', 'utf8');
            raw.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim();
                    envConfig[key] = val;
                }
            });
        }
    } catch (e) { }

    // Update values
    if (accessToken !== undefined) envConfig['ACCESS_TOKEN'] = accessToken;
    if (instagramId !== undefined) envConfig['INSTAGRAM_USER_ID'] = instagramId;
    if (publicUrl !== undefined) envConfig['BASE_URL'] = publicUrl;
    if (openAiKey !== undefined) envConfig['OPENAI_API_KEY'] = openAiKey;
    if (removeBgKey !== undefined) envConfig['REMOVE_BG_API_KEY'] = removeBgKey;

    // Convert back to string
    const newEnvContent = Object.entries(envConfig)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

    fs.writeFileSync('.env', newEnvContent);

    // Update runtime process.env
    if (accessToken) process.env.ACCESS_TOKEN = accessToken;
    if (instagramId) process.env.INSTAGRAM_USER_ID = instagramId;
    if (publicUrl) process.env.BASE_URL = publicUrl;
    if (openAiKey) {
        process.env.OPENAI_API_KEY = openAiKey;
        openai = new OpenAI({ apiKey: openAiKey });
    }
    if (removeBgKey) process.env.REMOVE_BG_API_KEY = removeBgKey;

    res.json({ message: 'Settings updated' });
});

app.post('/api/schedule', requireAuth, upload.single('image'), async (req, res) => {
    const { caption, scheduleTime } = req.body;

    let imageUrl = '';
    const localPath = req.file.path;

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
            const uploadResult = await cloudinary.uploader.upload(localPath, {
                folder: 'insta-sake',
                resource_type: 'image'
            });
            imageUrl = uploadResult.secure_url;
            // Clean up local file after upload
            fs.unlink(localPath, () => {});
        } catch (e) {
            console.error('Cloudinary upload failed:', e);
            return res.status(500).json({ error: 'Image upload to Cloudinary failed' });
        }
    } else {
        // Fallback to local path (won't work on Render free)
        imageUrl = localPath;
    }

    const post = {
        id: Date.now(),
        imagePath: imageUrl,
        caption,
        scheduleTime,
        status: 'scheduled',
        createdAt: new Date().toISOString()
    };

    db.get('posts').push(post).write();
    prunePosts(100);
    res.json({ message: 'Post scheduled successfully!', post });
});

app.get('/api/posts', requireAuth, (req, res) => {
    const posts = db.get('posts').value();
    res.json(posts);
});

// --- AI Endpoints ---

// 1. Analyze Sake Brand
app.post('/api/analyze-sake', requireAuth, upload.single('image'), async (req, res) => {
    if (!openai) return res.status(500).json({ error: 'OpenAI API Key not configured' });

    try {
        const base64Image = fs.readFileSync(req.file.path, { encoding: 'base64' });
        const dataUrl = `data:image/jpeg;base64,${base64Image}`; // Assuming jpeg/png

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "この写真に写っている日本酒の銘柄を特定してください（銘柄名は日本語で返してください）。また、その日本酒のイメージに合う背景（例：雪景色、桜、伝統的な和室など）を英語のプロンプトとして提案してください。JSON形式で { \"brand\": \"...\", \"background_prompt\": \"...\" } という形で返してください。" },
                        { type: "image_url", image_url: { url: dataUrl } },
                    ],
                },
            ],
            response_format: { type: "json_object" },
        });

        const result = JSON.parse(response.choices[0].message.content);
        res.json(result);
    } catch (error) {
        const detail = error?.response?.data?.error?.message || error?.message || 'Unknown error';
        console.error('Analysis failed:', error?.response?.data || error);
        res.status(500).json({ error: `Image analysis failed: ${detail}` });
    }
});

// 2. Generate Background & Composite
app.post('/api/generate-background', requireAuth, upload.single('image'), async (req, res) => {
    const { prompt } = req.body;
    // if (!process.env.REMOVE_BG_API_KEY) return res.status(500).json({ error: 'Remove.bg API Key not configured' });
    if (!openai) return res.status(500).json({ error: 'OpenAI API Key not configured' });

    try {
        const originalPath = req.file.path;
        const filename = path.basename(originalPath, path.extname(originalPath));

        // Skip background removal as requested by user
        /* 
        console.log('Removing background...');
        const formData = new FormData();
        formData.append('image_file', fs.createReadStream(originalPath));
        formData.append('size', 'auto');
        
        const removeBgResp = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
            headers: {
                ...formData.getHeaders(),
                'X-Api-Key': process.env.REMOVE_BG_API_KEY
            },
            responseType: 'arraybuffer'
        });
        
        const noBgPath = `uploads/${filename}_nobg.png`;
        fs.writeFileSync(noBgPath, removeBgResp.data);
        */

        // Use original image instead of noBgPath
        const sourceImagePath = originalPath;

        // Step B: Generate Background Image
        console.log(`Generating background with prompt: ${prompt}`);
        const bgGenResp = await openai.images.generate({
            model: "dall-e-3",
            prompt: `A high quality, photorealistic background for a sake bottle product shot. ${prompt}. No text, no bottles, just the background scenery.`,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json" // Get base64 to avoid download logic complexity for now
        });

        const bgBase64 = bgGenResp.data[0].b64_json;
        const bgBuffer = Buffer.from(bgBase64, 'base64');

        // Step C: Composite
        console.log('Compositing...');

        const finalPath = `uploads/${filename}_ai_gen.png`;

        // Load generated background
        const background = sharp(bgBuffer).resize(1080, 1080);

        // Load product
        const product = sharp(sourceImagePath);
        const productMeta = await product.metadata();

        // simple resizing logic: standard bottle fit
        let finalProductBuffer = await product.resize({
            height: 800,
            fit: 'inside'
        }).toBuffer();

        await background
            .composite([{ input: finalProductBuffer, gravity: 'center' }]) // center the bottle
            .toFile(finalPath);

        res.json({
            success: true,
            generatedImagePath: finalPath
        });

    } catch (error) {
        console.error('Generation failed:', error?.response?.data || error);
        res.status(500).json({ error: 'Background generation failed' });
    }
});

// 3. Clean Background (remove + neutral studio backdrop)
app.post('/api/clean-background', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const originalPath = req.file.path;
        const filename = path.basename(originalPath, path.extname(originalPath));
        const tone = (req.body.bgTone || 'warm').toLowerCase();
        const brightness = Math.max(0.85, Math.min(1.15, parseFloat(req.body.brightness || '1')));
        const useShadow = (req.body.shadow || 'true').toLowerCase() !== 'false';
        const subjectScale = Math.max(0.7, Math.min(1.2, parseFloat(req.body.subjectScale || '1')));
        const offsetX = Math.max(-160, Math.min(160, parseInt(req.body.offsetX || '0', 10)));
        const offsetY = Math.max(-160, Math.min(160, parseInt(req.body.offsetY || '0', 10)));
        const shadowStrength = Math.max(0.1, Math.min(0.8, parseFloat(req.body.shadowStrength || '0.35')));

        const noBgBuffer = await removeBackgroundBuffer(originalPath);

        const size = 1080;
        const tones = {
            warm: { c1: '#fbf7f0', c2: '#efe7dd' },
            neutral: { c1: '#f6f6f6', c2: '#e9e9e9' },
            cool: { c1: '#f2f6fb', c2: '#e3e9f2' }
        };
        const selectedTone = tones[tone] || tones.warm;
        const bgSvg = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="${selectedTone.c1}"/>
      <stop offset="100%" stop-color="${selectedTone.c2}"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;

        const background = sharp(Buffer.from(bgSvg))
            .resize(size, size)
            .modulate({ brightness });
        const subject = sharp(noBgBuffer).resize({ height: Math.round(900 * subjectScale), fit: 'inside' });
        const subjectBuffer = await subject.png().toBuffer();
        const subjectMeta = await sharp(subjectBuffer).metadata();

        const top = Math.round((size - subjectMeta.height) / 2) + offsetY;
        const left = Math.round((size - subjectMeta.width) / 2) + offsetX;

        const finalPath = `uploads/${filename}_clean.png`;
        const composites = [];
        if (useShadow) {
            const shadowBuffer = await sharp(subjectBuffer)
                .tint('#000000')
                .blur(18)
                .modulate({ brightness: 0.35 })
                .png()
                .toBuffer();
            composites.push({ input: shadowBuffer, top: top + 14, left: left + 10, opacity: shadowStrength });
        }
        composites.push({ input: subjectBuffer, top, left });

        await background.composite(composites).toFile(finalPath);

        res.json({
            success: true,
            generatedImagePath: finalPath
        });
    } catch (error) {
        console.error('Clean background failed:', error?.response?.data || error);
        const message = error?.message || 'Background cleaning failed';
        res.status(500).json({ error: message });
    }
});

// 4. Label Export (transparent/white background)
app.post('/api/label-export', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const originalPath = req.file.path;
        const filename = path.basename(originalPath, path.extname(originalPath));
        const width = Math.max(512, Math.min(2048, parseInt(req.body.width || '1000', 10)));
        const height = Math.max(512, Math.min(2048, parseInt(req.body.height || '1400', 10)));
        const margin = Math.max(0, Math.min(0.2, parseFloat(req.body.margin || '0.08')));
        const backgroundMode = (req.body.background || 'transparent').toLowerCase();

        const noBgBuffer = await removeBackgroundBuffer(originalPath);

        const background =
            backgroundMode === 'white'
                ? { r: 255, g: 255, b: 255, alpha: 1 }
                : { r: 0, g: 0, b: 0, alpha: 0 };

        const canvas = sharp({
            create: {
                width,
                height,
                channels: 4,
                background
            }
        });

        const maxW = Math.round(width * (1 - margin * 2));
        const maxH = Math.round(height * (1 - margin * 2));
        const subjectBuffer = await sharp(noBgBuffer)
            .resize({ width: maxW, height: maxH, fit: 'inside' })
            .png()
            .toBuffer();
        const subjectMeta = await sharp(subjectBuffer).metadata();

        const left = Math.round((width - subjectMeta.width) / 2);
        const top = Math.round((height - subjectMeta.height) / 2);

        const finalPath = `uploads/${filename}_label.png`;
        await canvas
            .composite([{ input: subjectBuffer, top, left }])
            .png()
            .toFile(finalPath);

        res.json({
            success: true,
            generatedImagePath: finalPath
        });
    } catch (error) {
        console.error('Label export failed:', error?.response?.data || error);
        const message = error?.message || 'Label export failed';
        res.status(500).json({ error: message });
    }
});


// Instagram Posting Function
async function postToInstagram(post) {
    const accessToken = process.env.ACCESS_TOKEN;
    const instagramId = process.env.INSTAGRAM_USER_ID;
    const baseUrl = process.env.PUBLIC_URL || process.env.BASE_URL;
    if (!accessToken) return { success: false, error: 'ACCESS_TOKEN is missing' };
    if (!instagramId) return { success: false, error: 'INSTAGRAM_USER_ID is missing' };

    // If imagePath is already a full URL (Cloudinary), use directly
    let imageUrl;
    if (post.imagePath.startsWith('https://')) {
        imageUrl = post.imagePath;
    } else {
        if (!baseUrl) return { success: false, error: 'PUBLIC_URL/BASE_URL is missing' };
        imageUrl = `${baseUrl}/${post.imagePath.replace(/\\/g, '/')}`;
    }

    try {
        await ensureImageUrlIsValid(imageUrl);
        console.log(`[Instagram] Creating media container for: ${imageUrl}`);
        // Step 1: Create Media Container
        const containerResp = await axios.post(`https://graph.facebook.com/v19.0/${instagramId}/media`, {
            image_url: imageUrl,
            caption: post.caption,
            access_token: accessToken
        });

        const creationId = containerResp.data.id;
        console.log(`[Instagram] Container created: ${creationId}. Waiting for processing...`);

        // Step 2: Poll for status before publish
        const maxAttempts = 10;
        const delayMs = 2000;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const statusResp = await axios.get(`https://graph.facebook.com/v19.0/${creationId}`, {
                params: {
                    fields: 'status_code',
                    access_token: accessToken
                }
            });
            const status = statusResp.data.status_code;
            if (status === 'FINISHED') break;
            if (status === 'ERROR') {
                throw new Error('Media processing failed');
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // Step 3: Publish Media
        const publishResp = await axios.post(`https://graph.facebook.com/v19.0/${instagramId}/media_publish`, {
            creation_id: creationId,
            access_token: accessToken
        });

        console.log(`[Instagram] Success! Post ID: ${publishResp.data.id}`);
        return { success: true };
    } catch (error) {
        console.error('[Instagram] Error posting:', error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

// Manual retry endpoint
app.post('/api/posts/:id/retry', requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    const post = db.get('posts').find({ id: postId }).value();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const result = await postToInstagram(post);
    const status = result.success ? 'posted' : 'failed';
    db.get('posts')
        .find({ id: postId })
        .assign({
            status,
            postedAt: new Date().toISOString(),
            error: result.error
        })
        .write();

    res.json({ success: result.success, status });
});

// Delete post
app.delete('/api/posts/:id', requireAuth, (req, res) => {
    const postId = Number(req.params.id);
    const post = db.get('posts').find({ id: postId }).value();
    if (!post) return res.status(404).json({ error: 'Post not found' });

    db.get('posts').remove({ id: postId }).write();
    res.json({ success: true });
});

// Scheduling Logic (runs every minute)
nodeCron.schedule('* * * * *', async () => {
    const now = new Date();
    const posts = db.get('posts').value();

    for (const post of posts) {
        if (post.status === 'scheduled' && new Date(post.scheduleTime) <= now) {
            console.log(`Executing post for ID: ${post.id}`);

            const result = await postToInstagram(post);

            const status = result.success ? 'posted' : 'failed';
            db.get('posts')
                .find({ id: post.id })
                .assign({
                    status: status,
                    postedAt: new Date().toISOString(),
                    error: result.error
                })
                .write();
        }
    }
});

// Serve frontend build (for production)
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Avoid returning HTML for API/uploads (missing files should 404)
    app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
