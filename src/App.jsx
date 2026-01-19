import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  console.log('App mounting...');
  
  // Auth state
  const [authChecked, setAuthChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('authToken') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [instagramId, setInstagramId] = useState('');
  const [publicUrl, setPublicUrl] = useState('');

  // AI Settings
  const [openAiKey, setOpenAiKey] = useState('');
  const [removeBgKey, setRemoveBgKey] = useState('');

  // AI State
  const [showAiStudio, setShowAiStudio] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detectedBrand, setDetectedBrand] = useState(null);
  const [bgPrompt, setBgPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generationMode, setGenerationMode] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanTone, setCleanTone] = useState('warm');
  const [cleanBrightness, setCleanBrightness] = useState(1);
  const [cleanShadow, setCleanShadow] = useState(true);
  const [cleanSubjectScale, setCleanSubjectScale] = useState(1.1);
  const [cleanOffsetX, setCleanOffsetX] = useState(0);
  const [cleanOffsetY, setCleanOffsetY] = useState(0);
  const [cleanShadowStrength, setCleanShadowStrength] = useState(0.35);
  const hasOpenAiKey = !!openAiKey && openAiKey.trim().length > 0;
  const [labeling, setLabeling] = useState(false);
  const [labelSize, setLabelSize] = useState('1000x1400');
  const [labelBackground, setLabelBackground] = useState('transparent');
  const [labelMargin, setLabelMargin] = useState(0.08);
  const apiBase =
    import.meta.env.VITE_API_BASE ||
    (typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:3001'
      : '');

  // Helper to add auth header to fetch requests
  const authHeaders = () => authToken ? { 'X-Auth-Token': authToken } : {};

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const resp = await fetch(`${apiBase}/api/auth-status`, {
          headers: authHeaders()
        });
        const data = await resp.json();
        setAuthRequired(data.authRequired);
        setAuthenticated(data.authenticated);
      } catch (e) {
        console.error('Auth check failed', e);
      } finally {
        setAuthChecked(true);
      }
    };
    checkAuth();
  }, [authToken]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const resp = await fetch(`${apiBase}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword })
      });
      const data = await resp.json();
      if (resp.ok && data.token) {
        setAuthToken(data.token);
        localStorage.setItem('authToken', data.token);
        setAuthenticated(true);
        setLoginPassword('');
      } else {
        setLoginError(data.error || 'ログイン失敗');
      }
    } catch (e) {
      setLoginError('ログインエラー');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    localStorage.removeItem('authToken');
    setAuthenticated(false);
  };

  const applyCleanPreset = (preset) => {
    if (preset === 'center') {
      setCleanSubjectScale(1.1);
      setCleanOffsetX(0);
      setCleanOffsetY(0);
      setCleanShadow(true);
      setCleanShadowStrength(0.35);
      return;
    }
    if (preset === 'bottle') {
      setCleanSubjectScale(1.18);
      setCleanOffsetX(0);
      setCleanOffsetY(10);
      setCleanShadow(true);
      setCleanShadowStrength(0.4);
      return;
    }
    if (preset === 'ochoko') {
      setCleanSubjectScale(1.12);
      setCleanOffsetX(-10);
      setCleanOffsetY(30);
      setCleanShadow(true);
      setCleanShadowStrength(0.3);
    }
  };

  const resetCleanAdjustments = () => {
    setCleanTone('warm');
    setCleanBrightness(1);
    setCleanShadow(true);
    setCleanSubjectScale(1.1);
    setCleanOffsetX(0);
    setCleanOffsetY(0);
    setCleanShadowStrength(0.35);
  };

  useEffect(() => {
    fetchPosts();
    fetchConfig();
    const interval = setInterval(fetchPosts, 30000); // 30秒ごとに更新
    return () => clearInterval(interval);
  }, []);

  const fetchConfig = async () => {
    try {
      const resp = await fetch(`${apiBase}/api/config`, {
        headers: authHeaders()
      });
      const data = await resp.json();
      console.log('Config loaded:', data);

      if (data.accessToken) setAccessToken(data.accessToken);
      if (data.instagramId) setInstagramId(data.instagramId);
      if (data.publicUrl) setPublicUrl(data.publicUrl);
      if (data.openAiKey) setOpenAiKey(data.openAiKey);
      if (data.removeBgKey) setRemoveBgKey(data.removeBgKey);
    } catch (err) {
      console.error('Failed to fetch config', err);
    }
  };

  const saveSettings = async () => {
    try {
      const resp = await fetch(`${apiBase}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ accessToken, instagramId, publicUrl, openAiKey, removeBgKey }),
      });
      if (resp.ok) {
        alert('設定を保存しました。');
        setShowSettings(false);
      }
    } catch (err) {
      alert('設定の保存に失敗しました。');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      // Reset AI state when new image picked
      setDetectedBrand(null);
      setGeneratedImage(null);
      setBgPrompt('');
      setGenerationMode(null);
      setCleanTone('warm');
      setCleanBrightness(1);
      setCleanShadow(true);
      setCleanSubjectScale(1.1);
      setCleanOffsetX(0);
      setCleanOffsetY(0);
      setCleanShadowStrength(0.35);
      setLabelSize('1000x1400');
      setLabelBackground('transparent');
      setLabelMargin(0.08);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setAnalyzing(true);
    const formData = new FormData();
    formData.append('image', image);

    try {
      const resp = await fetch(`${apiBase}/api/analyze-sake`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await resp.json();

      if (resp.ok) {
        setDetectedBrand(data.brand);
        setBgPrompt(data.background_prompt);
      } else {
        alert('解析失敗: ' + (data.error || '不明なエラー'));
      }
    } catch (e) {
      alert('解析エラー');
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const generateBackground = async () => {
    if (!image || !bgPrompt) return;
    setGenerating(true);
    setGenerationMode('ai');
    const formData = new FormData();
    formData.append('image', image);
    formData.append('prompt', bgPrompt);

    try {
      const resp = await fetch(`${apiBase}/api/generate-background`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await resp.json();

      if (resp.ok) {
        setGeneratedImage(`${apiBase}/${data.generatedImagePath}`);
      } else {
        alert('生成失敗: ' + (data.error || '不明なエラー'));
      }
    } catch (e) {
      alert('生成エラー');
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const cleanBackground = async () => {
    if (!image) return;
    setCleaning(true);
    setGenerationMode('clean');
    const formData = new FormData();
    formData.append('image', image);
    formData.append('bgTone', cleanTone);
    formData.append('brightness', String(cleanBrightness));
    formData.append('shadow', String(cleanShadow));
    formData.append('subjectScale', String(cleanSubjectScale));
    formData.append('offsetX', String(cleanOffsetX));
    formData.append('offsetY', String(cleanOffsetY));
    formData.append('shadowStrength', String(cleanShadowStrength));

    try {
      const resp = await fetch(`${apiBase}/api/clean-background`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await resp.json();

      if (resp.ok) {
        setGeneratedImage(`${apiBase}/${data.generatedImagePath}`);
      } else {
        alert('背景調整に失敗: ' + (data.error || '不明なエラー'));
      }
    } catch (e) {
      alert('背景調整エラー');
      console.error(e);
    } finally {
      setCleaning(false);
    }
  };

  const generateLabel = async () => {
    if (!image) return;
    setLabeling(true);
    setGenerationMode('label');
    const formData = new FormData();
    formData.append('image', image);
    const [width, height] = labelSize.split('x');
    formData.append('width', width);
    formData.append('height', height);
    formData.append('background', labelBackground);
    formData.append('margin', String(labelMargin));

    try {
      const resp = await fetch(`${apiBase}/api/label-export`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await resp.json();

      if (resp.ok) {
        setGeneratedImage(`${apiBase}/${data.generatedImagePath}`);
      } else {
        alert('ラベル生成に失敗: ' + (data.error || '不明なエラー'));
      }
    } catch (e) {
      alert('ラベル生成エラー');
      console.error(e);
    } finally {
      setLabeling(false);
    }
  };

  const useGeneratedImage = async () => {
    // Fetch the generated image and convert to File object
    try {
      const resp = await fetch(generatedImage);
      const blob = await resp.blob();
      const file = new File([blob], "generated_sake.png", { type: "image/png" });
      setImage(file);
      setPreview(generatedImage);
      setGeneratedImage(null); // Clear generated state as it's now the main image
      if (detectedBrand && generationMode !== 'label') {
        const tag = generationMode === 'clean' ? '#背景調整' : '#AI生成背景';
        setCaption(`【${detectedBrand}】\n\n#日本酒 #sake #${detectedBrand} ${tag}`);
      }
      setShowAiStudio(false); // Close AI studio
      setGenerationMode(null);
      window.scrollTo(0, document.body.scrollHeight); // Scroll to form
    } catch (e) {
      console.error(e);
      alert('画像の適用に失敗しました');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image || !scheduleTime) {
      alert('画像と投稿予定日時を指定してください。');
      return;
    }

    setLoading(true);
    const scheduleIso = new Date(scheduleTime).toISOString();
    const formData = new FormData();
    formData.append('image', image);
    formData.append('caption', caption);
    formData.append('scheduleTime', scheduleIso);

    try {
      const resp = await fetch(`${apiBase}/api/schedule`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (resp.ok) {
        alert('投稿を予約しました！');
        setImage(null);
        setPreview(null);
        setCaption('');
        setScheduleTime('');
        fetchPosts();
      } else {
        alert('予約に失敗しました。');
      }
    } catch (err) {
      console.error('Error scheduling post:', err);
      alert('予約に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const resp = await fetch(`${apiBase}/api/posts`, {
        headers: authHeaders()
      });
      const data = await resp.json();
      setPosts(data);
    } catch (err) {
      console.error('Failed to fetch posts', err);
    }
  };

  const retryPost = async (postId) => {
    try {
      const resp = await fetch(`${apiBase}/api/posts/${postId}/retry`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (resp.ok) {
        fetchPosts();
      } else {
        const data = await resp.json();
        alert('再試行に失敗しました: ' + (data.error || '不明なエラー'));
      }
    } catch (err) {
      console.error('Retry failed', err);
      alert('再試行に失敗しました。');
    }
  };

  const deletePost = async (postId) => {
    if (!confirm('この投稿を削除しますか？')) return;
    try {
      const resp = await fetch(`${apiBase}/api/posts/${postId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (resp.ok) {
        fetchPosts();
      } else {
        const data = await resp.json();
        alert('削除に失敗しました: ' + (data.error || '不明なエラー'));
      }
    } catch (err) {
      console.error('Delete failed', err);
      alert('削除に失敗しました。');
    }
  };

  const renderLabelControls = () => (
    <div style={{ marginTop: '1.25rem', textAlign: 'left' }}>
      <h4 style={{ marginBottom: '0.5rem' }}>ラベル用画像</h4>
      <label style={{ display: 'block', marginBottom: '0.25rem' }}>サイズ</label>
      <select
        value={labelSize}
        onChange={(e) => setLabelSize(e.target.value)}
        style={{ width: '100%' }}
      >
        <option value="1000x1400">縦長（1000×1400）</option>
        <option value="1080x1080">正方形（1080×1080）</option>
        <option value="1200x1600">縦長（1200×1600）</option>
      </select>
      <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>背景</label>
      <select
        value={labelBackground}
        onChange={(e) => setLabelBackground(e.target.value)}
        style={{ width: '100%' }}
      >
        <option value="transparent">透明</option>
        <option value="white">白</option>
      </select>
      <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>余白</label>
      <input
        type="range"
        min="0.02"
        max="0.2"
        step="0.01"
        value={labelMargin}
        onChange={(e) => setLabelMargin(parseFloat(e.target.value))}
      />
      <button
        onClick={generateLabel}
        className="btn-secondary"
        style={{ marginTop: '0.75rem', width: '100%' }}
        disabled={labeling}
      >
        {labeling ? '作成中...' : '🧾 ラベル用画像を作る'}
      </button>
    </div>
  );

  // Loading state while checking auth
  if (!authChecked) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Login screen if auth required but not authenticated
  if (authRequired && !authenticated) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <h1 style={{ marginBottom: '0.5rem' }}>🍶 InstaFlow</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>ログインしてください</p>
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>パスワード</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="パスワードを入力"
                autoFocus
              />
            </div>
            {loginError && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{loginError}</p>}
            <button type="submit" disabled={loginLoading}>
              {loginLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>InstaFlow</h1>
            <p className="subtitle">Instagram投稿をスタイリッシュに自動化</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{ width: 'auto', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)' }}
            >
              {showSettings ? '閉じる' : '⚙️ 設定'}
            </button>
            {authRequired && (
              <button
                onClick={handleLogout}
                style={{ width: 'auto', padding: '0.5rem 1rem', background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}
              >
                ログアウト
              </button>
            )}
          </div>
        </div>
      </header>

      {showSettings && (
        <section className="card" style={{ marginBottom: '2rem', animation: 'fadeIn 0.3s' }}>
          <h2>API設定</h2>
          <div className="input-group">
            <label>Instagram アクセストークン</label>
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAb..." />
          </div>
          <div className="input-group">
            <label>Instagram ビジネスID</label>
            <input type="text" value={instagramId} onChange={(e) => setInstagramId(e.target.value)} placeholder="1784..." />
          </div>
          <div className="input-group">
            <label>公開ベースURL（ngrok等）</label>
            <input type="text" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://..." />
          </div>
          <h3 style={{ marginTop: '1.5rem', color: 'var(--primary)' }}>AI設定 (オプション)</h3>
          <div className="input-group">
            <label>OpenAI API Key (Vision & DALL-E)</label>
            <input type="password" value={openAiKey} onChange={(e) => setOpenAiKey(e.target.value)} placeholder="sk-..." />
          </div>
          <div className="input-group">
            <label>Remove.bg API Key (背景削除)</label>
            <input type="password" value={removeBgKey} onChange={(e) => setRemoveBgKey(e.target.value)} placeholder="Key..." />
          </div>
          <button onClick={saveSettings}>設定を保存</button>
        </section>
      )}

      <main className="dashboard-grid">
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>新規投稿の作成</h2>

          <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
            {preview ? (
              <img src={preview} alt="プレビュー" className="preview-img" style={{ maxHeight: '400px' }} />
            ) : (
              <div>
                <p>クリックして画像を選択</p>
                <span style={{ fontSize: '2rem' }}>📷</span>
              </div>
            )}
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* AI Studio Toggle */}
          {image && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                onClick={() => setShowAiStudio(!showAiStudio)}
                style={{ width: 'auto', background: showAiStudio ? 'var(--card)' : 'linear-gradient(45deg, #10b981, #059669)', border: showAiStudio ? '1px solid white' : 'none' }}
              >
                {showAiStudio ? 'AIスタジオを閉じる' : '✨ AI背景生成スタジオ'}
              </button>
            </div>
          )}

          {/* AI Studio Panel */}
          {showAiStudio && image && (
            <div className="ai-studio" style={{ marginTop: '2rem' }}>
              <h3>AI背景ジェネレーター</h3>

              {!detectedBrand && !analyzing && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p>この写真の日本酒銘柄を解析し、最適な背景を提案します。</p>
                  {!hasOpenAiKey && (
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                      OpenAI未設定のため、銘柄解析とAI背景生成は利用できません。
                    </p>
                  )}
                  <button onClick={analyzeImage} style={{ maxWidth: '300px' }} disabled={!hasOpenAiKey}>
                    🔍 銘柄を解析する
                  </button>
                  <button onClick={cleanBackground} className="btn-secondary" style={{ maxWidth: '300px', marginTop: '0.75rem' }}>
                    ✨ 背景を綺麗にする
                  </button>
                  <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem' }}>プリセット</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('center')}>中央寄せ</button>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('bottle')}>ボトル強調</button>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('ochoko')}>お猪口強調</button>
                      <button type="button" onClick={resetCleanAdjustments}>リセット</button>
                    </div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', marginTop: '0.75rem' }}>背景トーン</label>
                    <select
                      value={cleanTone}
                      onChange={(e) => setCleanTone(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="warm">暖色（和紙風）</option>
                      <option value="neutral">ニュートラル</option>
                      <option value="cool">寒色（クリア）</option>
                    </select>
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>明るさ</label>
                    <input
                      type="range"
                      min="0.85"
                      max="1.15"
                      step="0.01"
                      value={cleanBrightness}
                      onChange={(e) => setCleanBrightness(parseFloat(e.target.value))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>被写体サイズ</label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.2"
                      step="0.01"
                      value={cleanSubjectScale}
                      onChange={(e) => setCleanSubjectScale(parseFloat(e.target.value))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>横位置</label>
                    <input
                      type="range"
                      min="-160"
                      max="160"
                      step="1"
                      value={cleanOffsetX}
                      onChange={(e) => setCleanOffsetX(parseInt(e.target.value, 10))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>縦位置</label>
                    <input
                      type="range"
                      min="-160"
                      max="160"
                      step="1"
                      value={cleanOffsetY}
                      onChange={(e) => setCleanOffsetY(parseInt(e.target.value, 10))}
                    />
                    <label style={{ display: 'block', marginTop: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={cleanShadow}
                        onChange={(e) => setCleanShadow(e.target.checked)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      影を付ける
                    </label>
                    {cleanShadow && (
                      <>
                        <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>影の強さ</label>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.01"
                          value={cleanShadowStrength}
                          onChange={(e) => setCleanShadowStrength(parseFloat(e.target.value))}
                        />
                      </>
                    )}
                  </div>
                  {renderLabelControls()}
                </div>
              )}

              {analyzing && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <p>画像を解析中...</p>
                </div>
              )}

              {detectedBrand && hasOpenAiKey && (
                <div style={{ animation: 'fadeIn 0.5s' }}>
                  <div className="detected-info">
                    <div className="detected-brand">検出: {detectedBrand}</div>
                    <label>生成プロンプト:</label>
                    <textarea
                      className="prompt-editor"
                      value={bgPrompt}
                      onChange={(e) => setBgPrompt(e.target.value)}
                    />
                  </div>

                  {!generating && !generatedImage && (
                    <button onClick={generateBackground}>🎨 背景を生成＆合成する</button>
                  )}
                  {!cleaning && !generatedImage && (
                    <button onClick={cleanBackground} className="btn-secondary" style={{ marginTop: '0.5rem' }}>
                      ✨ 背景を綺麗にする
                    </button>
                  )}
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem' }}>プリセット</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('center')}>中央寄せ</button>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('bottle')}>ボトル強調</button>
                      <button type="button" className="btn-secondary" onClick={() => applyCleanPreset('ochoko')}>お猪口強調</button>
                      <button type="button" onClick={resetCleanAdjustments}>リセット</button>
                    </div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', marginTop: '0.75rem' }}>背景トーン</label>
                    <select
                      value={cleanTone}
                      onChange={(e) => setCleanTone(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="warm">暖色（和紙風）</option>
                      <option value="neutral">ニュートラル</option>
                      <option value="cool">寒色（クリア）</option>
                    </select>
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>明るさ</label>
                    <input
                      type="range"
                      min="0.85"
                      max="1.15"
                      step="0.01"
                      value={cleanBrightness}
                      onChange={(e) => setCleanBrightness(parseFloat(e.target.value))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>被写体サイズ</label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.2"
                      step="0.01"
                      value={cleanSubjectScale}
                      onChange={(e) => setCleanSubjectScale(parseFloat(e.target.value))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>横位置</label>
                    <input
                      type="range"
                      min="-160"
                      max="160"
                      step="1"
                      value={cleanOffsetX}
                      onChange={(e) => setCleanOffsetX(parseInt(e.target.value, 10))}
                    />
                    <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>縦位置</label>
                    <input
                      type="range"
                      min="-160"
                      max="160"
                      step="1"
                      value={cleanOffsetY}
                      onChange={(e) => setCleanOffsetY(parseInt(e.target.value, 10))}
                    />
                    <label style={{ display: 'block', marginTop: '0.75rem' }}>
                      <input
                        type="checkbox"
                        checked={cleanShadow}
                        onChange={(e) => setCleanShadow(e.target.checked)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      影を付ける
                    </label>
                    {cleanShadow && (
                      <>
                        <label style={{ display: 'block', margin: '0.75rem 0 0.25rem' }}>影の強さ</label>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.01"
                          value={cleanShadowStrength}
                          onChange={(e) => setCleanShadowStrength(parseFloat(e.target.value))}
                        />
                      </>
                    )}
                  </div>
                  {renderLabelControls()}
                </div>
              )}

              {generating && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <p>背景を生成して合成中...\n(これには少し時間がかかります)</p>
                </div>
              )}

              {cleaning && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <p>背景を整えています...\n(これには少し時間がかかります)</p>
                </div>
              )}

              {labeling && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <p>ラベル用画像を作成中...\n(これには少し時間がかかります)</p>
                </div>
              )}

              {generatedImage && (
                <div className="comparison-view" style={{ animation: 'fadeIn 0.5s' }}>
                  <div>
                    <p style={{ textAlign: 'center' }}>元画像</p>
                    <img src={preview} style={{ width: '100%', borderRadius: '0.5rem' }} alt="元画像" />
                  </div>
                  <div>
                    <p style={{ textAlign: 'center', color: 'var(--primary)', fontWeight: 'bold' }}>
                      {generationMode === 'clean' ? '背景調整後' : generationMode === 'label' ? 'ラベル用画像' : 'AI生成画像'}
                    </p>
                    <img src={generatedImage} style={{ width: '100%', borderRadius: '0.5rem' }} alt="AI生成画像" />
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                    {generationMode !== 'label' && (
                      <button onClick={useGeneratedImage}>🚀 この画像を使って投稿する</button>
                    )}
                    {generationMode === 'label' && (
                      <a href={generatedImage} download className="btn-secondary" style={{ display: 'inline-block' }}>
                        ⬇️ ダウンロード
                      </a>
                    )}
                    <button className="btn-secondary" onClick={() => setGeneratedImage(null)} style={{ marginTop: '0.5rem' }}>やり直す</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
            <div className="input-group">
              <label>キャプション</label>
              <textarea
                rows="4"
                placeholder="ここにキャプションを入力..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>投稿予定日時</label>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? '処理中...' : '投稿を予約する'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>予約済みリスト</h2>
          <div className="post-list">
            {posts.length === 0 && <p style={{ color: 'var(--text-dim)' }}>予約された投稿はありません。</p>}
            {posts.map(post => (
              <div key={post.id} className="post-item">
                <img src={post.imagePath.startsWith('https://') ? post.imagePath : `${apiBase}/${post.imagePath}`} alt="投稿画像" className="post-thumb" />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span className={`status-badge ${post.status}`}>
                      {post.status === 'scheduled' ? '予約中' :
                        post.status === 'failed' ? '投稿失敗' : '投稿済み'}
                    </span>
                    <small style={{ color: 'var(--text-dim)' }}>
                      {new Date(post.scheduleTime).toLocaleString('ja-JP')}
                    </small>
                  </div>
                  <p style={{ fontSize: '0.9rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {post.caption || 'キャプションなし'}
                  </p>
                  {post.status === 'failed' && post.error && (
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                      {typeof post.error === 'string'
                        ? post.error
                        : post.error?.error?.message || '投稿に失敗しました'}
                    </p>
                  )}
                  {post.status === 'failed' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => retryPost(post.id)}
                      >
                        再試行
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => deletePost(post.id)}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
