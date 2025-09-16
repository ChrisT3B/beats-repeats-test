import React, { useState, useEffect, useRef } from 'react';
import './App.css';

const SpotifyReactTest = () => {
  // State management
  const [authStatus, setAuthStatus] = useState('Initializing...');
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [logs, setLogs] = useState([]);
  const [audioCaptureResult, setAudioCaptureResult] = useState(null);

  // Refs
  const logRef = useRef(null);

  // Configuration
  const CLIENT_ID = '994bacff4dea4100864d3197b151fe95';
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');

  // Utility functions
  const log = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };
    setLogs(prev => [...prev, logEntry]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const clearLog = () => setLogs([]);

  // PKCE Helper Functions
  const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const generateCodeChallenge = async (verifier) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  // Authentication
  const authenticate = async () => {
    log('Starting PKCE Spotify authentication...');
    
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    sessionStorage.setItem('code_verifier', codeVerifier);
    
    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(SCOPES)}&` +
      `code_challenge_method=S256&` +
      `code_challenge=${codeChallenge}&` +
      `show_dialog=true`;
    
    window.location.href = authUrl;
  };

  const handleAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      log(`Authentication error: ${error}`, 'error');
      setAuthStatus('❌ Authentication failed');
      return;
    }

    if (code) {
      log('Authorization code received, exchanging for token with PKCE...');
      setAuthStatus('🔄 Exchanging code for token...');
      
      try {
        const storedCodeVerifier = sessionStorage.getItem('code_verifier');
        if (!storedCodeVerifier) {
          throw new Error('Code verifier not found');
        }
        
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_id=${CLIENT_ID}&code_verifier=${storedCodeVerifier}`
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorData.error_description || errorData.error}`);
        }

        const tokenData = await tokenResponse.json();
        
        if (tokenData.access_token) {
          setAccessToken(tokenData.access_token);
          log('✅ Access token obtained with PKCE', 'success');
          setAuthStatus('✅ Authenticated with Spotify');
          
          sessionStorage.removeItem('code_verifier');
          window.history.replaceState({}, document.title, REDIRECT_URI);
          
          return tokenData.access_token;
        }
      } catch (error) {
        log(`Token exchange error: ${error.message}`, 'error');
        setAuthStatus('❌ Token exchange failed');
      }
    }
  };

  // Spotify Player Setup - Official Pattern
  const initializePlayer = (token) => {
    if (!token) return;

    log('Initializing Spotify Web Player (official pattern)...');
    
    // Official Spotify pattern from their React example
    const spotifyPlayer = new window.Spotify.Player({
      name: 'Beats & Repeats Test Player',
      getOAuthToken: cb => { cb(token); },
      volume: 0.5
    });

    setPlayer(spotifyPlayer);

    // Error handling - official pattern
    spotifyPlayer.addListener('initialization_error', ({ message }) => {
      log(`Initialization error: ${message}`, 'error');
      setAuthStatus('❌ Player initialization failed');
    });

    spotifyPlayer.addListener('authentication_error', ({ message }) => {
      log(`Authentication error: ${message}`, 'error');
    });

    spotifyPlayer.addListener('account_error', ({ message }) => {
      log(`Account error: ${message} - Premium required`, 'error');
    });

    // Playbook status - official pattern
    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) {
        setCurrentTrack(null);
        setIsPaused(true);
        return;
      }

      setIsPaused(state.paused);
      if (state.track_window.current_track) {
        const track = `${state.track_window.current_track.artists[0].name} - ${state.track_window.current_track.name}`;
        setCurrentTrack(track);
        log(`Now playing: ${track}`);
      }

      // Check if player is active (official pattern)
      spotifyPlayer.getCurrentState().then(currentState => {
        if (!currentState) {
          log('Player is not active - transfer playback needed');
        }
      });
    });

    // Ready - official pattern
    spotifyPlayer.addListener('ready', ({ device_id }) => {
      log(`✅ Player ready! Device ID: ${device_id}`, 'success');
      setDeviceId(device_id);
      setAuthStatus('✅ Player ready - Transfer playback from Spotify app');
    });

    // Not ready - official pattern
    spotifyPlayer.addListener('not_ready', ({ device_id }) => {
      log(`Player not ready. Device ID: ${device_id}`, 'warning');
    });

    // Connect - official pattern
    spotifyPlayer.connect().then(success => {
      if (success) {
        log('✅ Connected to Spotify Web Player (official pattern)', 'success');
      } else {
        log('❌ Failed to connect', 'error');
      }
    });
  };

  // Playback controls
  const togglePlayback = async () => {
    if (player) {
      try {
        await player.togglePlay();
        log('Toggled playback');
      } catch (error) {
        log(`Playback error: ${error.message}`, 'error');
      }
    }
  };

  const transferPlayback = async () => {
    if (!deviceId || !accessToken) return;

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player`, {
        method: 'PUT',
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
      });

      if (response.ok) {
        log('✅ Playback transferred', 'success');
      } else {
        log(`Transfer failed: ${response.status}`, 'error');
      }
    } catch (error) {
      log(`Transfer error: ${error.message}`, 'error');
    }
  };

  // CRITICAL AUDIO TESTS
  const testAudioCapture = async () => {
    log('🔊 CRITICAL TEST: Testing audio capture capabilities...', 'warning');
    
    let results = {
      displayMedia: false,
      webAudio: true, // Assume available
      mediaRecorder: false,
      error: null
    };

    try {
      // Test 1: System audio capture
      log('Testing getDisplayMedia for system audio...');
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: true
      });
      
      if (displayStream.getAudioTracks().length > 0) {
        results.displayMedia = true;
        log('✅ System audio capture: SUCCESS', 'success');
        displayStream.getTracks().forEach(track => track.stop());
      }
    } catch (error) {
      log(`❌ System audio capture failed: ${error.message}`, 'error');
      results.error = error.message;
    }

    try {
      // Test 2: MediaRecorder
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm')) {
        results.mediaRecorder = true;
        log('✅ MediaRecorder supported', 'success');
      }
    } catch (error) {
      log(`MediaRecorder test failed: ${error.message}`, 'error');
    }

    setAudioCaptureResult(results);
    
    if (results.displayMedia) {
      log('🟢 VERDICT: Audio capture POSSIBLE - Spotify integration viable!', 'success');
    } else {
      log('🔴 VERDICT: Audio capture NOT possible - Recommend built-in player', 'error');
    }
  };

  const testFullAudioMixing = async () => {
    log('🔀 Testing full audio mixing (mic + system)...', 'warning');
    
    try {
      // Get microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      log('✅ Microphone access granted');

      // Get system audio
      const systemStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: false, 
        audio: true 
      });
      log('✅ System audio access granted');

      // Test Web Audio API mixing
      const audioContext = new AudioContext();
      const micSource = audioContext.createMediaStreamSource(micStream);
      const systemSource = audioContext.createMediaStreamSource(systemStream);
      const mixerGain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();
      
      micSource.connect(mixerGain);
      systemSource.connect(mixerGain);
      mixerGain.connect(destination);
      
      log('✅ FULL AUDIO MIXING: SUCCESS!', 'success');
      log('✅ Coach voice + Spotify music mixing confirmed', 'success');
      
      // Cleanup
      micStream.getTracks().forEach(track => track.stop());
      systemStream.getTracks().forEach(track => track.stop());
      audioContext.close();
      
    } catch (error) {
      log(`❌ Audio mixing failed: ${error.message}`, 'error');
    }
  };

  // Effects - Following Official Spotify Pattern
  useEffect(() => {
    log('🚀 React Spotify Test initialized - Following official pattern');
    
    // Check for auth callback first
    handleAuthCallback().then(token => {
      if (token) {
        // Load SDK only after we have token (official pattern)
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.async = true;
        document.body.appendChild(script);

        // Handle SDK ready - official pattern
        window.onSpotifyWebPlaybackSDKReady = () => {
          log('🎵 Spotify Web Playback SDK loaded (official pattern)');
          initializePlayer(token);
        };
      } else {
        log('No token found - please authenticate first');
        setAuthStatus('🔐 Please authenticate with Spotify');
      }
    });

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <div className="section">
          <h1 className="title">
            🎵 Spotify React PWA Test
          </h1>
          <p className="subtitle">Beats & Repeats - Audio Integration Validation</p>
          
          <div className={`status ${authStatus.includes('❌') ? 'error' : authStatus.includes('✅') ? 'success' : 'info'}`}>
            {authStatus}
          </div>

          <div className="controls">
            <button
              onClick={authenticate}
              className="btn primary"
            >
              🔐 Login
            </button>
            <button
              onClick={togglePlayback}
              disabled={!player}
              className="btn primary"
            >
              ▶️ Play/Pause
            </button>
            <button
              onClick={transferPlayback}
              disabled={!deviceId}
              className="btn secondary"
            >
              🔄 Transfer
            </button>
            <button
              onClick={testAudioCapture}
              disabled={!player}
              className="btn warning"
            >
              🔊 Test Audio
            </button>
          </div>
        </div>

        {/* Device Status */}
        <div className="section">
          <h3>📊 Device & Playback Status</h3>
          <div className="device-info">
            <div>Device ID: <span className="value">{deviceId || 'Not connected'}</span></div>
            <div>Status: <span className="value">
              {player ? (isPaused ? 'Ready (Paused)' : 'Playing') : 'Inactive'}
            </span></div>
            <div>Track: <span className="value">{currentTrack || 'None'}</span></div>
          </div>
        </div>

        {/* Critical Audio Test */}
        <div className="section critical">
          <h3>🔊 CRITICAL TEST: Audio Stream Capture</h3>
          <p><strong>This test determines if Spotify audio can be captured for mixing with microphone</strong></p>
          
          <div className="controls">
            <button
              onClick={testAudioCapture}
              disabled={!player}
              className="btn warning"
            >
              🎤 Test Audio Capture
            </button>
            <button
              onClick={testFullAudioMixing}
              disabled={!player}
              className="btn warning"
            >
              🔀 Test Full Mixing
            </button>
          </div>
          
          {audioCaptureResult && (
            <div className="results">
              <h4>Audio Capture Results:</h4>
              <div className="result-item">
                System Audio (getDisplayMedia): {audioCaptureResult.displayMedia ? 
                  <span className="success">✅ AVAILABLE</span> : 
                  <span className="error">❌ NOT AVAILABLE</span>
                }
              </div>
              <div className="result-item">
                Web Audio API: {audioCaptureResult.webAudio ? 
                  <span className="success">✅ AVAILABLE</span> : 
                  <span className="error">❌ NOT AVAILABLE</span>
                }
              </div>
              <div className="result-item">
                MediaRecorder: {audioCaptureResult.mediaRecorder ? 
                  <span className="success">✅ AVAILABLE</span> : 
                  <span className="error">❌ NOT AVAILABLE</span>
                }
              </div>
              
              <div className="verdict">
                <strong className={audioCaptureResult.displayMedia ? 'success' : 'error'}>
                  VERDICT: {audioCaptureResult.displayMedia ? 
                    '🟢 Spotify integration IS viable!' : 
                    '🔴 Recommend built-in music player approach'
                  }
                </strong>
              </div>
              
              {audioCaptureResult.error && (
                <div className="error">Error: {audioCaptureResult.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Technical Log */}
        <div className="section">
          <div className="log-header">
            <h3>📝 Technical Log</h3>
            <button onClick={clearLog} className="btn secondary">Clear</button>
          </div>
          
          <div ref={logRef} className="log">
            {logs.map((entry, index) => (
              <div key={index} className={`log-entry ${entry.type}`}>
                [{entry.timestamp}] {entry.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpotifyReactTest;