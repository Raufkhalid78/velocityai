import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, AlertTriangle, Settings, RotateCcw, MapPin, Volume2, Mic, Activity, Edit3, Save, Map as MapIcon, BarChart2, Camera, Trash2, Timer, AlertOctagon, Zap, Satellite, Music, Upload, ChevronRight, Info } from 'lucide-react';
import Speedometer from './components/Speedometer';
import HistoryChart from './components/HistoryChart';
import MapDisplay from './components/MapDisplay';
import { Unit, LocationState, SpeedData, AlertSettings, SpeedCamera } from './types';
import { generateVoiceAlert, playBase64Audio } from './services/geminiService';
import { supabase, isSupabaseConfigured } from './src/services/supabase';
import { syncSettings, saveSpeedPoint, saveCamera, fetchCameras, fetchProfile } from './src/services/supabaseService';
import { User } from '@supabase/supabase-js';

const App: React.FC = () => {
  const convertSpeed = (ms: number, targetUnit: Unit): number => {
    switch (targetUnit) {
      case Unit.KMH: return ms * 3.6;
      case Unit.MPH: return ms * 2.23694;
      case Unit.KNOTS: return ms * 1.94384;
      default: return ms;
    }
  };

  // State
  const [isTracking, setIsTracking] = useState(false);
  const [hudMode, setHudMode] = useState(false);
  const [unit, setUnit] = useState<Unit>(Unit.KMH);
  const [speedLimit, setSpeedLimit] = useState<number>(60);
  const [presets, setPresets] = useState<number[]>([50, 80, 120]); // Default presets
  const [viewMode, setViewMode] = useState<'chart' | 'map'>('map');
  
  const [locationState, setLocationState] = useState<LocationState>({
    speed: 0,
    latitude: null,
    longitude: null,
    accuracy: null,
    heading: null,
    address: null,
  });
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'searching' | 'active' | 'error' | 'denied'>('idle');
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [history, setHistory] = useState<SpeedData[]>([]);
  
  // Statistics State
  const [violationCount, setViolationCount] = useState(0);
  const [timeOverLimit, setTimeOverLimit] = useState(0);

  // Camera State
  const [speedCameras, setSpeedCameras] = useState<SpeedCamera[]>([]);
  const [triggeredCameras, setTriggeredCameras] = useState<Set<string>>(new Set());
  const [cameraAlertActive, setCameraAlertActive] = useState(false);
  const [activeCameraLimit, setActiveCameraLimit] = useState<number | null>(null);

  // Alert State
  const [alertSettings, setAlertSettings] = useState<AlertSettings>({
    enabled: true,
    aiEnabled: true,
    threshold: 0, // Tolerance (e.g., alert at limit + 0)
    type: 'beep',
    customVoiceText: "Please slow down, you are exceeding the speed limit.",
    voiceAudioUrl: null, // Stores base64 string
    customAudioData: null, // Stores base64 string
  });
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCameraList, setShowCameraList] = useState(false);
  const [showAddCameraModal, setShowAddCameraModal] = useState(false);
  const [editingCameraId, setEditingCameraId] = useState<string | null>(null);
  const [addCameraSpeedLimit, setAddCameraSpeedLimit] = useState("");
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState("");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isFloating, setIsFloating] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(true);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const currentConvertedSpeed = convertSpeed(locationState.speed || 0, unit);

  // Refs
  const watchId = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const oscillator = useRef<OscillatorNode | null>(null);
  const lastAlertTime = useRef<number>(0);
  const lastGeoFetchTime = useRef<number>(0);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Stats Refs
  const isSpeedingRef = useRef(false);
  const lastStatTime = useRef<number>(0);

  // Supabase Auth Listener
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sync with Supabase when user logs in
  useEffect(() => {
    if (user) {
      const loadProfile = async () => {
        const profile = await fetchProfile();
        if (profile) {
          setUnit(profile.unit as Unit);
          setSpeedLimit(profile.speed_limit);
          setPresets(profile.presets);
          setViolationCount(profile.violation_count);
          setTimeOverLimit(profile.time_over_limit);
          setAlertSettings(profile.alert_settings);
        }
        const cameras = await fetchCameras();
        if (cameras.length > 0) setSpeedCameras(cameras);
      };
      loadProfile();
    }
  }, [user]);

  // Sync settings to Supabase
  useEffect(() => {
    if (user) {
      syncSettings({
        unit,
        speedLimit,
        presets,
        violationCount,
        timeOverLimit,
        alertSettings
      });
    }
  }, [unit, speedLimit, presets, violationCount, timeOverLimit, alertSettings, user]);

  // Auth Handlers
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      alert("Supabase is not configured. Please check your environment variables.");
      return;
    }
    setIsAuthLoading(true);
    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        alert("Check your email for the confirmation link!");
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!isSupabaseConfigured()) return;
    await supabase.auth.signOut();
  };
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isTracking && wakeLockEnabled) {
        try {
          const lock = await (navigator as any).wakeLock.request('screen');
          setWakeLock(lock);
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      }
    };

    if (isTracking && wakeLockEnabled) {
      requestWakeLock();
    } else {
      if (wakeLock) {
        wakeLock.release().then(() => setWakeLock(null));
      }
    }

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, [isTracking, wakeLockEnabled]);

  // Floating Mode (PiP) Logic
  const toggleFloating = async () => {
    if (!pipVideoRef.current) return;

    if (isFloating) {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
      setIsFloating(false);
    } else {
      try {
        // Start canvas stream to video
        if (pipCanvasRef.current && pipVideoRef.current) {
          const stream = pipCanvasRef.current.captureStream(10); // 10 FPS is enough for speed
          pipVideoRef.current.srcObject = stream;
          await pipVideoRef.current.play();
          await pipVideoRef.current.requestPictureInPicture();
          setIsFloating(true);
        }
      } catch (err) {
        console.error("PiP failed", err);
        alert("Floating mode is not supported on this browser.");
      }
    }
  };

  // Update PiP Canvas
  useEffect(() => {
    if (!isFloating || !pipCanvasRef.current) return;

    const canvas = pipCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderPip = () => {
      if (!isFloating) return;

      // Clear
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Speed
      const speed = convertSpeed(locationState.speed || 0, unit).toFixed(0);
      const isSpeeding = convertSpeed(locationState.speed || 0, unit) > speedLimit;
      
      // Speed Text
      ctx.fillStyle = isSpeeding ? '#ef4444' : '#3b82f6';
      ctx.font = 'bold 140px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(speed, canvas.width / 2, canvas.height / 2 - 20);

      // Unit Text
      ctx.fillStyle = '#71717a';
      ctx.font = 'bold 30px Orbitron, sans-serif';
      ctx.fillText(unit, canvas.width / 2, canvas.height / 2 + 60);

      // Limit Indicator
      if (speedLimit > 0) {
        ctx.fillStyle = isSpeeding ? '#ef4444' : '#27272a';
        ctx.font = 'bold 20px Orbitron, sans-serif';
        ctx.fillText(`LIMIT: ${speedLimit}`, canvas.width / 2, canvas.height / 2 + 100);
      }

      requestAnimationFrame(renderPip);
    };

    const animId = requestAnimationFrame(renderPip);
    return () => cancelAnimationFrame(animId);
  }, [isFloating, locationState.speed, unit, speedLimit, currentConvertedSpeed]);

  // Listen for PiP exit
  useEffect(() => {
    const handlePipExit = () => setIsFloating(false);
    const video = pipVideoRef.current;
    if (video) {
      video.addEventListener('leavepictureinpicture', handlePipExit);
    }
    return () => {
      if (video) video.removeEventListener('leavepictureinpicture', handlePipExit);
    };
  }, []);
  // Load settings from local storage
  useEffect(() => {
    const savedCameras = localStorage.getItem('speedCameras');
    if (savedCameras) {
      try { setSpeedCameras(JSON.parse(savedCameras)); } catch (e) { console.error("Failed to parse cameras"); }
    }

    const savedUnit = localStorage.getItem('velocity_unit');
    if (savedUnit) setUnit(savedUnit as Unit);

    const savedLimit = localStorage.getItem('velocity_limit');
    if (savedLimit) setSpeedLimit(parseInt(savedLimit));

    const savedPresets = localStorage.getItem('velocity_presets');
    if (savedPresets) {
      try { setPresets(JSON.parse(savedPresets)); } catch (e) { console.error("Failed to parse presets"); }
    }

    const savedAlerts = localStorage.getItem('velocity_alerts');
    if (savedAlerts) {
      try { setAlertSettings(JSON.parse(savedAlerts)); } catch (e) { console.error("Failed to parse alerts"); }
    }
  }, []);

  // Save settings to local storage
  useEffect(() => {
    localStorage.setItem('velocity_unit', unit);
  }, [unit]);

  useEffect(() => {
    localStorage.setItem('velocity_limit', speedLimit.toString());
  }, [speedLimit]);

  useEffect(() => {
    localStorage.setItem('velocity_presets', JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem('velocity_alerts', JSON.stringify(alertSettings));
  }, [alertSettings]);

  useEffect(() => {
    localStorage.setItem('speedCameras', JSON.stringify(speedCameras));
  }, [speedCameras]);

  // PWA Install Logic
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Audio Context Initialization
  const initAudio = () => {
    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContext.current.state === 'suspended') {
      audioContext.current.resume();
    }
  };


  // Reverse Geocoding
  const fetchAddress = async (lat: number, lon: number) => {
    const now = Date.now();
    // Throttle requests: only fetch every 15 seconds to be polite but more responsive
    if (now - lastGeoFetchTime.current < 15000) return;
    
    try {
      lastGeoFetchTime.current = now;
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`, {
        headers: {
          'User-Agent': 'VelocityAI/1.0'
        }
      });
      if (!response.ok) throw new Error("Network response was not ok");
      
      const data = await response.json();
      if (data && data.address) {
        const a = data.address;
        const parts = [];
        
        // Detailed hierarchy check for address components
        const street = a.road || a.street || a.pedestrian || a.footway || a.path || a.cycleway;
        const neighborhood = a.neighbourhood || a.suburb || a.district || a.quarter || a.hamlet;
        const locality = a.city || a.town || a.village || a.municipality;
        
        if (street) parts.push(street);
        if (neighborhood && neighborhood !== street) parts.push(neighborhood);
        if (locality && locality !== neighborhood) parts.push(locality);

        if (parts.length > 0) {
          setLocationState(prev => ({ ...prev, address: parts.join(', ') }));
        } else {
           // Fallback if no specific address parts found
           setLocationState(prev => ({ ...prev, address: data.display_name?.split(',').slice(0, 2).join(',') || "Unknown Location" }));
        }
      }
    } catch (error) {
      console.warn("Geocoding failed", error);
    }
  };

  // Helper: Haversine Distance
  const getDistanceFromLatLonInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // Geolocation Logic
  const startTracking = useCallback(() => {
    initAudio();
    setIsTracking(true);
    setGpsStatus('searching');
    
    // Reset Session Stats
    setMaxSpeed(0);
    setHistory([]);
    setViolationCount(0);
    setTimeOverLimit(0);
    isSpeedingRef.current = false;
    lastStatTime.current = Date.now();

    if ('geolocation' in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          setGpsStatus('active');
          const { latitude, longitude, speed, accuracy, heading } = position.coords;
          // Speed is in m/s. Null if stationary/unavailable.
          // Note: Some browsers return null speed when stationary. Treat as 0.
          const validSpeed = speed !== null ? speed : 0;
          
          setLocationState(prev => ({
            ...prev,
            latitude,
            longitude,
            speed: validSpeed,
            accuracy,
            heading
          }));

          // Fetch address if we have valid coordinates
          if (latitude && longitude) {
            fetchAddress(latitude, longitude);
          }

          // Convert for history and max check
          const converted = convertSpeed(validSpeed, unit);
          
          // Update Max Speed
          setMaxSpeed(prev => Math.max(prev, converted));

          // Update History
          setHistory(prev => {
            const newData: SpeedData = {
              timestamp: Date.now(),
              speed: converted,
              latitude,
              longitude
            };
            
            // Save to Supabase if logged in
            if (user) {
              saveSpeedPoint(newData);
            }

            const newHistory = [...prev, newData];
            return newHistory.length > 100 ? newHistory.slice(1) : newHistory; // Keep last 100
          });
        },
        (error) => {
          console.error("Error getting location", error);
          let errorMessage = "GPS Error";
          if (error.code === error.PERMISSION_DENIED) {
            setGpsStatus('denied');
            errorMessage = "GPS Permission Denied";
          } else if (error.code === error.TIMEOUT) {
            setGpsStatus('error');
            errorMessage = "GPS Timeout - searching...";
            // Don't stop tracking on timeout, it might recover
            return;
          } else {
            setGpsStatus('error');
          }
          alert(`GPS Error: ${errorMessage}. Please check your device settings.`);
          setIsTracking(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000, // Increased timeout to 20s
          maximumAge: 0,
        }
      );
    } else {
      setGpsStatus('error');
      alert("Geolocation is not supported by this browser.");
    }
  }, [unit]);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    setGpsStatus('idle');
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    stopBeep();
  }, []);

  // Beep Logic
  const playBeep = (frequency = 800, duration = 0.1, type: OscillatorType = 'square') => {
    if (!audioContext.current) return;
    
    const osc = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioContext.current.currentTime);
    osc.connect(gainNode);
    gainNode.connect(audioContext.current.destination);
    
    osc.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.current.currentTime + duration);
    osc.stop(audioContext.current.currentTime + duration);
  };

  const playCameraAlert = () => {
    if (alertSettings.enabled && alertSettings.aiEnabled && alertSettings.type === 'voice') {
      // If voice is enabled, we could generate a specific alert for camera
      // But for now, let's just use a distinct triple beep or the generic voice alert if available
      if (alertSettings.voiceAudioUrl && audioContext.current) {
         playBase64Audio(alertSettings.voiceAudioUrl, audioContext.current);
      } else {
        // Fallback to distinct beeps
        playBeep(1200, 0.1);
        setTimeout(() => playBeep(1200, 0.1), 150);
        setTimeout(() => playBeep(1200, 0.1), 300);
      }
    } else {
      // Triple beep high pitch
      playBeep(1200, 0.1);
      setTimeout(() => playBeep(1200, 0.1), 150);
      setTimeout(() => playBeep(1200, 0.1), 300);
    }
  };

  const stopBeep = () => {
    if (oscillator.current) {
      oscillator.current.stop();
      oscillator.current.disconnect();
      oscillator.current = null;
    }
  };

  // Speed Limit Alarm Check
  useEffect(() => {
    if (!isTracking || !alertSettings.enabled) return;

    const limitWithThreshold = speedLimit + alertSettings.threshold;

    if (currentConvertedSpeed > limitWithThreshold) {
      const now = Date.now();
      // Throttle alerts
      if (alertSettings.type === 'voice' && alertSettings.voiceAudioUrl) {
        if (now - lastAlertTime.current > 5000) {
          if (audioContext.current) {
            playBase64Audio(alertSettings.voiceAudioUrl, audioContext.current);
            lastAlertTime.current = now;
          }
        }
      } else if (alertSettings.type === 'custom' && alertSettings.customAudioData) {
        if (now - lastAlertTime.current > 5000) {
           if (audioContext.current) {
             playBase64Audio(alertSettings.customAudioData, audioContext.current);
             lastAlertTime.current = now;
           }
        }
      } else {
         if (now - lastAlertTime.current > 800) {
           playBeep(800, 0.1, 'square');
           lastAlertTime.current = now;
         }
      }
    }
  }, [currentConvertedSpeed, speedLimit, isTracking, alertSettings]);

  // Session Statistics Calculation (Violations & Time Over Limit)
  useEffect(() => {
    if (!isTracking) return;

    const now = Date.now();
    // Calculate time elapsed since last check (or start)
    // We update this on every render triggered by locationState change to accumulate time accurately
    let timeDelta = (now - lastStatTime.current) / 1000; // seconds
    if (timeDelta < 0) timeDelta = 0; // protection against clock weirdness
    lastStatTime.current = now;

    if (currentConvertedSpeed > speedLimit) {
      if (!isSpeedingRef.current) {
        // Just started speeding
        isSpeedingRef.current = true;
        setViolationCount(prev => prev + 1);
      }
      // Add duration
      setTimeOverLimit(prev => prev + timeDelta);
    } else {
      isSpeedingRef.current = false;
    }

  }, [locationState, isTracking, speedLimit, currentConvertedSpeed]);

  // Speed Camera Proximity Check
  useEffect(() => {
    if (!isTracking || !locationState.latitude || !locationState.longitude) return;

    let nearestDist = Infinity;

    speedCameras.forEach(cam => {
      const dist = getDistanceFromLatLonInMeters(locationState.latitude!, locationState.longitude!, cam.latitude, cam.longitude);
      
      if (dist < nearestDist) nearestDist = dist;

      // Check proximity (700m - 900m window logic, approximated to < 900m trigger)
      if (dist <= 900 && !triggeredCameras.has(cam.id)) {
        // Trigger alert
        setTriggeredCameras(prev => new Set(prev).add(cam.id));
        setCameraAlertActive(true);
        setActiveCameraLimit(cam.speedLimit || null);
        
        if (alertSettings.enabled) {
          playCameraAlert();
        }

        // Auto-hide visual alert after 5s
        setTimeout(() => {
          setCameraAlertActive(false);
          setActiveCameraLimit(null);
        }, 5000);
      } else if (dist > 1000 && triggeredCameras.has(cam.id)) {
        // Reset trigger when moving away
        setTriggeredCameras(prev => {
          const next = new Set(prev);
          next.delete(cam.id);
          return next;
        });
      }
    });
  }, [locationState, speedCameras, isTracking, triggeredCameras]);

  // Gemini TTS Generation
  const handleGenerateVoice = async () => {
    setIsGeneratingVoice(true);
    const audioData = await generateVoiceAlert(alertSettings.customVoiceText);
    if (audioData) {
      setAlertSettings(prev => ({ ...prev, voiceAudioUrl: audioData }));
      // Preview it
      if (audioContext.current) {
         playBase64Audio(audioData, audioContext.current);
      } else {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        playBase64Audio(audioData, ctx);
      }
    } else {
      alert("Failed to generate voice. Please check API Key or connection.");
    }
    setIsGeneratingVoice(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (limit to 2MB for performance)
      if (file.size > 2 * 1024 * 1024) {
        alert("File is too large. Please upload an audio file smaller than 2MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        // Extract base64 part
        const base64 = result.split(',')[1];
        setAlertSettings(prev => ({ ...prev, customAudioData: base64 }));
        
        // Preview
        if (audioContext.current) {
           playBase64Audio(base64, audioContext.current);
        } else {
           const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
           playBase64Audio(base64, ctx);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePresetChange = (index: number, value: string) => {
    const val = parseInt(value);
    if (!isNaN(val)) {
      const newPresets = [...presets];
      newPresets[index] = val;
      setPresets(newPresets);
    }
  };

  const handleManualLimitSubmit = () => {
    const val = parseInt(tempLimit);
    if (!isNaN(val) && val > 0) {
      setSpeedLimit(val);
      setIsEditingLimit(false);
    }
  };

  const handleAddCamera = () => {
    if (!locationState.latitude || !locationState.longitude) {
      alert("GPS location required to add a camera.");
      return;
    }
    setEditingCameraId(null);
    setAddCameraSpeedLimit(speedLimit.toString());
    setShowAddCameraModal(true);
  };

  const handleEditCamera = (id: string) => {
    const cam = speedCameras.find(c => c.id === id);
    if (cam) {
      setEditingCameraId(id);
      setAddCameraSpeedLimit(cam.speedLimit?.toString() || "");
      setShowAddCameraModal(true);
    }
  };

  // Expose to window for Leaflet popups
  useEffect(() => {
    (window as any).editCamera = handleEditCamera;
    return () => { delete (window as any).editCamera; };
  }, [speedCameras]);

  const confirmAddCamera = () => {
    const parsedLimit = parseInt(addCameraSpeedLimit);

    if (editingCameraId) {
      updateCamera(editingCameraId, { speedLimit: (parsedLimit && !isNaN(parsedLimit)) ? parsedLimit : undefined });
    } else {
      const newCam: SpeedCamera = {
        id: Date.now().toString(),
        latitude: locationState.latitude!,
        longitude: locationState.longitude!,
        createdAt: Date.now(),
        speedLimit: (parsedLimit && !isNaN(parsedLimit)) ? parsedLimit : undefined
      };
      
      // Save to Supabase
      if (user) {
        saveCamera(newCam);
      }

      setSpeedCameras(prev => [...prev, newCam]);
    }
    
    setShowAddCameraModal(false);
    setAddCameraSpeedLimit("");
    setEditingCameraId(null);
  };

  const updateCamera = (id: string, updates: Partial<SpeedCamera>) => {
    setSpeedCameras(prev => prev.map(cam => cam.id === id ? { ...cam, ...updates } : cam));
  };

  const deleteCamera = (id: string) => {
    setSpeedCameras(prev => prev.filter(cam => cam.id !== id));
  };

  const clearCameras = () => {
    if (window.confirm("Clear all saved speed cameras?")) {
      setSpeedCameras([]);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col items-center bg-[#09090b] text-zinc-100 relative transition-transform duration-500 ${hudMode ? 'scale-x-[-1]' : ''}`}>
      
      {/* HUD Mode Overlay */}
      <AnimatePresence>
        {hudMode && (
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -20 }}
             className="absolute top-4 left-4 z-50 transform scale-x-[-1]"
           >
              <button 
                onClick={() => setHudMode(false)}
                className="bg-zinc-900/80 backdrop-blur-md p-3 rounded-full border border-zinc-800 text-white shadow-xl"
              >
                <RotateCcw size={20} />
              </button>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden elements for PiP */}
      <canvas ref={pipCanvasRef} width="300" height="300" className="hidden" />
      <video ref={pipVideoRef} className="hidden" muted playsInline />

      {/* Camera Alert Overlay */}
      <AnimatePresence>
        {cameraAlertActive && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className="absolute top-24 z-40 bg-brand-orange text-white px-8 py-4 rounded-2xl flex items-center space-x-4 shadow-[0_0_40px_rgba(249,115,22,0.4)] border border-white/20"
          >
             <div className="bg-white/20 p-2 rounded-lg">
               <Camera size={28} className="animate-pulse" />
             </div>
             <div className="flex flex-col">
               <span className="font-bold text-xl tracking-tight">SPEED CAMERA</span>
               {activeCameraLimit && (
                 <span className="text-sm font-speedo font-bold bg-black/20 px-2 py-0.5 rounded-md mt-1">
                   LIMIT: {activeCameraLimit} {unit}
                 </span>
               )}
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Camera Modal */}
      <AnimatePresence>
        {showAddCameraModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCameraModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 shadow-2xl space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="p-4 bg-brand-orange/10 rounded-2xl text-brand-orange border border-brand-orange/20 mb-2">
                  <Camera size={32} />
                </div>
                <h3 className="text-xl font-black tracking-tight">{editingCameraId ? 'EDIT CAMERA' : 'REPORT CAMERA'}</h3>
                <p className="text-xs text-zinc-500 font-medium">{editingCameraId ? 'Update the speed limit for this camera' : 'Set the speed limit for this location'}</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="number"
                    value={addCameraSpeedLimit}
                    onChange={(e) => setAddCameraSpeedLimit(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-6 text-center text-4xl font-speedo font-black text-white focus:border-blue-500 outline-none transition-colors"
                    placeholder="--"
                    autoFocus
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-600 font-black uppercase text-xs tracking-widest">
                    {unit}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {presets.map(val => (
                    <button 
                      key={val}
                      onClick={() => setAddCameraSpeedLimit(val.toString())}
                      className="py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold transition-all"
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                {editingCameraId ? (
                  <button 
                    onClick={() => {
                      deleteCamera(editingCameraId);
                      setShowAddCameraModal(false);
                      setEditingCameraId(null);
                    }}
                    className="flex-1 py-4 bg-red-900/20 border border-red-900/50 text-red-500 font-bold rounded-xl transition-all"
                  >
                    DELETE
                  </button>
                ) : (
                  <button 
                    onClick={() => setShowAddCameraModal(false)}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-bold rounded-xl transition-all"
                  >
                    CANCEL
                  </button>
                )}
                <button 
                  onClick={confirmAddCamera}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all"
                >
                  {editingCameraId ? 'UPDATE' : 'CONFIRM'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="w-full p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center space-x-3"
        >
          <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-500/20">
            <Activity className="text-blue-500" size={24} />
          </div>
          <h1 className="text-2xl font-speedo font-black tracking-tighter italic">VELOCITY<span className="text-blue-500">AI</span></h1>
        </motion.div>
        
        {!hudMode && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex space-x-2"
          >
            <button 
              onClick={toggleFloating}
              className={`p-2 rounded-xl transition-all border ${isFloating ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'}`}
              title="Floating Mode"
            >
              <Zap size={22} className={isFloating ? 'animate-pulse' : ''} />
            </button>
            <button 
              onClick={() => setHudMode(!hudMode)} 
              className={`px-4 py-2 rounded-xl font-speedo text-xs font-bold transition-all border ${hudMode ? 'bg-blue-600 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'}`}
            >
              HUD
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className={`p-2 rounded-xl transition-all border ${showSettings ? 'bg-zinc-100 text-zinc-900 border-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'}`}
            >
              <Settings size={22} />
            </button>
          </motion.div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-lg px-6 space-y-8 pb-24 pb-[env(safe-area-inset-bottom)]">
        
        {/* Speedometer Section */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-0 mt-4"
        >
          <Speedometer 
            currentSpeed={currentConvertedSpeed} 
            limit={speedLimit} 
            unit={unit} 
            maxSpeed={maxSpeed}
          />
        </motion.div>

        {/* Location Display */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center space-x-3 text-zinc-400 bg-zinc-900/40 px-4 py-2 rounded-full border border-zinc-800/50 backdrop-blur-sm max-w-full overflow-hidden"
        >
          {gpsStatus === 'searching' ? (
             <div className="flex items-center space-x-2 text-yellow-500 animate-pulse">
                <Satellite size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Acquiring GPS...</span>
             </div>
          ) : gpsStatus === 'denied' ? (
             <div className="flex items-center space-x-2 text-red-500">
                <AlertTriangle size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">GPS Denied</span>
             </div>
          ) : (
             <>
               <MapPin size={16} className={`flex-shrink-0 ${gpsStatus === 'active' ? 'text-blue-500' : 'text-zinc-600'}`} />
               <span className="text-xs font-medium truncate tracking-tight">
                 {locationState.address || "Searching for location..."}
               </span>
             </>
          )}
        </motion.div>

        {/* Primary Controls */}
        {!showSettings && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full space-y-8"
          >
            
            {/* Limit Setter & Presets */}
            <div className="glass-panel p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-zinc-500 font-bold text-[10px] tracking-[0.2em] uppercase">Speed Limit</span>
                  <span className="text-zinc-300 text-xs font-medium">Alert threshold active</span>
                </div>
                
                {isEditingLimit ? (
                  <div className="flex items-center space-x-2">
                    <input 
                      type="number" 
                      value={tempLimit}
                      onChange={(e) => setTempLimit(e.target.value)}
                      className="w-20 bg-zinc-950 border border-zinc-700 rounded-lg text-center text-white p-2 font-speedo text-xl focus:border-blue-500 outline-none"
                      autoFocus
                    />
                    <button onClick={handleManualLimitSubmit} className="p-2 bg-blue-600 rounded-lg text-white"><Save size={20}/></button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-6">
                    <button 
                      onClick={() => setSpeedLimit(l => Math.max(0, l - 5))}
                      className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center font-bold text-xl transition-all active:scale-90 border border-zinc-700"
                    >-</button>
                    <button 
                      onClick={() => { setTempLimit(speedLimit.toString()); setIsEditingLimit(true); }}
                      className="text-4xl font-speedo font-black w-20 text-center hover:text-blue-400 transition-colors"
                      title="Click to edit manually"
                    >
                      {speedLimit}
                    </button>
                    <button 
                      onClick={() => setSpeedLimit(l => l + 5)}
                      className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center font-bold text-xl transition-all active:scale-90 border border-zinc-700"
                    >+</button>
                  </div>
                )}
              </div>
              
              {/* Presets Row */}
              <div className="grid grid-cols-3 gap-3">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSpeedLimit(p)}
                    className={`py-3 rounded-xl text-sm font-speedo font-bold transition-all border ${
                      speedLimit === p 
                        ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-6 gap-3">
              <button 
                onClick={isTracking ? stopTracking : startTracking}
                className={`col-span-5 py-5 rounded-2xl flex items-center justify-center space-x-4 text-xl font-black tracking-tighter transition-all duration-500 shadow-2xl border ${
                  isTracking 
                    ? 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20' 
                    : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 hover:scale-[1.02] shadow-blue-600/20'
                }`}
              >
                {isTracking ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} />}
                <span className="font-speedo">{isTracking ? 'STOP TRACKING' : 'START TRACKING'}</span>
              </button>
              
              <button 
                onClick={handleAddCamera}
                className="col-span-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 transition-all active:scale-95 group"
                title="Report Camera"
              >
                 <Camera size={28} className="group-hover:text-brand-orange transition-colors" />
              </button>
            </div>

            {/* Dashboard View (Chart or Map) */}
            <div className="w-full">
              <div className="flex bg-zinc-900/60 p-1 rounded-2xl border border-zinc-800/50 mb-4">
                <button 
                  onClick={() => setViewMode('map')}
                  className={`flex-1 flex items-center justify-center py-3 rounded-xl text-xs font-bold tracking-widest transition-all ${viewMode === 'map' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <MapIcon size={14} className="mr-2"/> MAP
                </button>
                <button 
                  onClick={() => setViewMode('chart')}
                  className={`flex-1 flex items-center justify-center py-3 rounded-xl text-xs font-bold tracking-widest transition-all ${viewMode === 'chart' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <BarChart2 size={14} className="mr-2"/> ANALYTICS
                </button>
              </div>

              <motion.div 
                key={viewMode}
                initial={{ opacity: 0, x: viewMode === 'map' ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full"
              >
                {viewMode === 'map' ? (
                  <div className="rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl h-[35vh] min-h-[250px] max-h-[400px]">
                    <MapDisplay 
                      latitude={locationState.latitude} 
                      longitude={locationState.longitude} 
                      speedCameras={speedCameras} 
                      triggeredCameras={triggeredCameras}
                    />
                  </div>
                ) : (
                  <div className="glass-panel p-4 h-[35vh] min-h-[250px] max-h-[400px]">
                    <HistoryChart data={history} unit={unit} limit={speedLimit} />
                  </div>
                )}
              </motion.div>
            </div>

            {/* Advanced Stats Grid */}
            <div className="grid grid-cols-3 gap-3 w-full">
              {/* Max Speed */}
              <div className="data-card flex flex-col items-center justify-center">
                 <div className="flex items-center space-x-2 mb-2">
                    <Zap size={12} className="text-yellow-500" />
                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Peak</span>
                 </div>
                 <div className="flex items-baseline space-x-1">
                   <span className="font-mono-display text-2xl font-bold text-white leading-none">
                     {maxSpeed.toFixed(0)}
                   </span>
                   <span className="text-[10px] text-zinc-600 font-bold uppercase">{unit}</span>
                 </div>
              </div>
              
              {/* Violation Count */}
              <div className="data-card flex flex-col items-center justify-center">
                 <div className="flex items-center space-x-2 mb-2">
                    <AlertOctagon size={12} className="text-brand-orange" />
                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Alerts</span>
                 </div>
                 <span className="font-mono-display text-2xl font-bold text-brand-orange leading-none">
                   {violationCount}
                 </span>
              </div>

              {/* Time Over Limit */}
              <div className="data-card flex flex-col items-center justify-center">
                 <div className="flex items-center space-x-2 mb-2">
                    <Timer size={12} className="text-brand-red" />
                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Duration</span>
                 </div>
                 <div className="font-mono-display text-xl font-bold text-brand-red leading-none flex items-baseline">
                   {Math.floor(timeOverLimit / 60)}<span className="text-[10px] text-zinc-600 mx-0.5">m</span> 
                   {Math.floor(timeOverLimit % 60).toString().padStart(2, '0')}<span className="text-[10px] text-zinc-600">s</span>
                 </div>
              </div>
            </div>

            {/* Secondary Stats Grid */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50 flex items-center space-x-4">
                <div className="p-2 bg-zinc-800 rounded-lg">
                  <Satellite size={16} className="text-zinc-500" />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Accuracy</div>
                  <div className="font-mono-display text-sm text-zinc-300 font-bold">
                    {locationState.accuracy ? `±${locationState.accuracy.toFixed(1)}m` : '--'}
                  </div>
                </div>
              </div>
               <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/50 flex items-center space-x-4">
                <div className="p-2 bg-zinc-800 rounded-lg">
                  <RotateCcw size={16} className="text-zinc-500" />
                </div>
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">Heading</div>
                  <div className="font-mono-display text-sm text-zinc-300 font-bold">
                    {locationState.heading ? `${locationState.heading.toFixed(0)}°` : '--'}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="w-full bg-zinc-900/95 backdrop-blur-xl rounded-t-[2.5rem] border-t border-zinc-800 p-8 space-y-8 absolute bottom-0 left-0 z-50 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
               <div className="flex justify-between items-center mb-2">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black tracking-tight flex items-center">
                      <Settings className="mr-3 text-blue-500" size={24}/> 
                      System Settings
                    </h2>
                    <p className="text-xs text-zinc-500 font-medium">Configure your driving experience</p>
                  </div>
                  <button 
                    onClick={() => setShowSettings(false)} 
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 transition-colors"
                  >
                    <RotateCcw size={20} className="rotate-45" />
                  </button>
               </div>

                {/* Supabase Cloud Sync */}
                <div className="p-6 bg-zinc-950/80 rounded-[2rem] border border-zinc-800/50 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${user ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        <Satellite size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black tracking-tight uppercase">Cloud Sync</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                          {user ? 'Connected to Supabase' : 'Offline Mode'}
                        </p>
                      </div>
                    </div>
                    {user && (
                      <button 
                        onClick={handleSignOut}
                        className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        Sign Out
                      </button>
                    )}
                  </div>

                  {!user ? (
                    <form onSubmit={handleAuth} className="space-y-4">
                      <div className="space-y-3">
                        <input 
                          type="email" 
                          placeholder="Email Address"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                          required
                        />
                        <input 
                          type="password" 
                          placeholder="Password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none transition-colors"
                          required
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button 
                          type="submit"
                          disabled={isAuthLoading}
                          onClick={() => setAuthMode('signin')}
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all disabled:opacity-50"
                        >
                          {isAuthLoading && authMode === 'signin' ? 'Signing in...' : 'Sign In'}
                        </button>
                        <button 
                          type="submit"
                          disabled={isAuthLoading}
                          onClick={() => setAuthMode('signup')}
                          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl text-xs transition-all disabled:opacity-50"
                        >
                          {isAuthLoading && authMode === 'signup' ? 'Creating...' : 'Sign Up'}
                        </button>
                      </div>
                      <p className="text-[9px] text-zinc-600 text-center font-medium">
                        Sync your speed history, cameras, and settings across devices.
                      </p>
                    </form>
                  ) : (
                    <div className="flex items-center space-x-4 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black">
                        {user.email?.[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user.email}</p>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Active Session</p>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">Synced</span>
                      </div>
                    </div>
                  )}
                </div>

               {/* Background Info */}
               <div className="p-5 bg-blue-600/5 rounded-2xl border border-blue-500/10 space-y-3">
                  <div className="flex items-center space-x-2 text-blue-400">
                     <Info size={16} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Background Usage</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    To keep tracking in the background, use <strong className="text-zinc-200">Floating Mode</strong> or install as a <strong className="text-zinc-200">PWA</strong>. The app uses Screen Wake Lock to prevent dimming while tracking is active.
                  </p>
               </div>

               {/* PWA Install Button */}
               {deferredPrompt && (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="pt-2"
                 >
                   <button 
                     onClick={handleInstallClick}
                     className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-2xl flex items-center justify-center space-x-3 transition-all shadow-lg shadow-blue-600/20"
                   >
                     <Upload size={20} />
                     <span>Install Velocity AI App</span>
                   </button>
                 </motion.div>
               )}

                {/* Floating Mode Toggle */}
                <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800/50">
                   <div className="flex items-center space-x-4">
                     <div className={`p-3 rounded-xl transition-colors ${isFloating ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}>
                       <Zap size={24} />
                     </div>
                     <div>
                       <h3 className="font-bold text-sm tracking-tight">FLOATING MODE</h3>
                       <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Stay on top of other apps</p>
                     </div>
                   </div>
                   <button 
                     onClick={toggleFloating}
                     className={`w-14 h-7 rounded-full transition-all relative ${isFloating ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                   >
                     <motion.div 
                       animate={{ x: isFloating ? 28 : 4 }}
                       className="absolute top-1.5 w-4 h-4 rounded-full bg-white shadow-sm" 
                     />
                   </button>
                </div>

                 {/* Keep Screen On Toggle */}
                 <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800/50">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-xl transition-colors ${wakeLockEnabled ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        <Timer size={24} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm tracking-tight">KEEP SCREEN ON</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Prevent device from sleeping</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setWakeLockEnabled(!wakeLockEnabled)}
                      className={`w-14 h-7 rounded-full transition-all relative ${wakeLockEnabled ? 'bg-yellow-600' : 'bg-zinc-800'}`}
                    >
                      <motion.div 
                        animate={{ x: wakeLockEnabled ? 28 : 4 }}
                        className="absolute top-1.5 w-4 h-4 rounded-full bg-white shadow-sm" 
                      />
                    </button>
                 </div>

               {/* AI Master Toggle */}
               <div className="flex items-center justify-between p-5 bg-zinc-950/50 rounded-2xl border border-zinc-800/50">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-xl transition-colors ${alertSettings.aiEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      <Activity size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm tracking-tight">AI VOICE ENGINE</h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Powered by Gemini 3</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const nextAiEnabled = !alertSettings.aiEnabled;
                      setAlertSettings(s => ({
                        ...s, 
                        aiEnabled: nextAiEnabled,
                        type: (!nextAiEnabled && s.type === 'voice') ? 'beep' : s.type
                      }));
                    }}
                    className={`w-14 h-7 rounded-full transition-all relative ${alertSettings.aiEnabled ? 'bg-blue-600' : 'bg-zinc-800'}`}
                  >
                    <motion.div 
                      animate={{ x: alertSettings.aiEnabled ? 28 : 4 }}
                      className="absolute top-1.5 w-4 h-4 rounded-full bg-white shadow-sm" 
                    />
                  </button>
               </div>

               {/* Units */}
               <div className="space-y-3">
                 <label className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em]">Measurement Units</label>
                 <div className="flex bg-zinc-950 rounded-2xl p-1.5 border border-zinc-800/50">
                   {Object.values(Unit).map((u) => (
                     <button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${unit === u ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                     >
                       {u}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Preset Config */}
               <div className="space-y-3">
                 <label className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] flex items-center">
                   <Edit3 size={12} className="mr-2"/> Speed Presets
                 </label>
                 <div className="grid grid-cols-3 gap-3">
                   {presets.map((p, idx) => (
                     <div key={idx} className="flex flex-col space-y-2">
                       <input
                          type="number"
                          value={p}
                          onChange={(e) => handlePresetChange(idx, e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-center text-white font-speedo text-lg focus:border-blue-500 outline-none transition-colors"
                       />
                       <span className="text-[10px] text-zinc-600 font-bold text-center uppercase">Slot {idx + 1}</span>
                     </div>
                   ))}
                 </div>
               </div>

               {/* Camera Management */}
               <div className="space-y-3">
                  <label className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] flex items-center justify-between">
                     <span className="flex items-center"><Camera size={12} className="mr-2"/> Speed Cameras</span>
                     <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">{speedCameras.length} Active</span>
                  </label>
                  <div className="flex space-x-3">
                    <button 
                      onClick={handleAddCamera}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl py-4 text-xs font-bold flex items-center justify-center space-x-2 transition-all"
                    >
                       <Camera size={16}/> <span>Add Current</span>
                    </button>
                    <button 
                      onClick={() => setShowCameraList(!showCameraList)}
                      className={`flex-1 border rounded-xl py-4 text-xs font-bold flex items-center justify-center space-x-2 transition-all ${showCameraList ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                       <Edit3 size={16}/> <span>{showCameraList ? 'Hide List' : 'Manage All'}</span>
                    </button>
                    <button 
                      onClick={clearCameras}
                      className="bg-red-900/10 border border-red-900/30 text-red-500 rounded-xl px-4 flex items-center justify-center hover:bg-red-900/20 transition-all"
                      title="Clear All Cameras"
                    >
                       <Trash2 size={20}/>
                    </button>
                  </div>

                  <AnimatePresence>
                    {showCameraList && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                          {speedCameras.length === 0 ? (
                            <div className="bg-zinc-950/50 border border-dashed border-zinc-800 rounded-2xl py-8 flex flex-col items-center justify-center space-y-2">
                              <Info size={24} className="text-zinc-700" />
                              <p className="text-zinc-600 text-xs font-medium italic">No cameras saved yet.</p>
                            </div>
                          ) : (
                            speedCameras.map(cam => (
                              <motion.div 
                                layout
                                key={cam.id} 
                                className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-4 space-y-4"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-brand-orange/10 rounded-xl text-brand-orange border border-brand-orange/20">
                                      <Camera size={16} />
                                    </div>
                                    <input 
                                      type="text"
                                      value={cam.name || `Camera ${cam.id.slice(-4)}`}
                                      onChange={(e) => updateCamera(cam.id, { name: e.target.value })}
                                      className="bg-transparent border-none text-sm font-black text-white focus:ring-0 p-0 w-40"
                                      placeholder="Camera Name"
                                    />
                                  </div>
                                  <button 
                                    onClick={() => deleteCamera(cam.id)}
                                    className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">Speed Limit</label>
                                    <div className="flex items-center space-x-3">
                                      <input 
                                        type="number"
                                        value={cam.speedLimit || ""}
                                        onChange={(e) => updateCamera(cam.id, { speedLimit: parseInt(e.target.value) || undefined })}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-speedo focus:border-blue-500 outline-none transition-colors"
                                        placeholder="None"
                                      />
                                      <span className="text-[10px] text-zinc-500 font-bold">{unit}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">Location</label>
                                    <div className="flex items-center space-x-2 text-[10px] text-zinc-400 bg-zinc-900 rounded-lg px-3 py-2 border border-zinc-800 h-[38px]">
                                      <MapPin size={12} className="text-blue-500" />
                                      <span className="truncate font-mono">{cam.latitude.toFixed(4)}, {cam.longitude.toFixed(4)}</span>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
               </div>

               {/* Alert Settings */}
               <div className="space-y-6 pt-6 border-t border-zinc-800">
                 <div className="flex items-center justify-between">
                   <label className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] flex items-center">
                     Alert Preferences <AlertTriangle size={12} className="ml-2 text-yellow-500"/>
                   </label>
                   <button 
                     onClick={() => setAlertSettings(s => ({...s, enabled: !s.enabled}))}
                     className={`w-14 h-7 rounded-full transition-all relative ${alertSettings.enabled ? 'bg-brand-emerald' : 'bg-zinc-800'}`}
                   >
                     <motion.div 
                       animate={{ x: alertSettings.enabled ? 28 : 4 }}
                       className="absolute top-1.5 w-4 h-4 rounded-full bg-white shadow-sm" 
                     />
                   </button>
                 </div>

                 <AnimatePresence>
                   {alertSettings.enabled && (
                     <motion.div 
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, y: 20 }}
                       className="space-y-6"
                     >
                       <div className="flex bg-zinc-950 rounded-2xl p-1.5 border border-zinc-800/50">
                         <button
                            onClick={() => setAlertSettings(s => ({...s, type: 'beep'}))}
                            className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${alertSettings.type === 'beep' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                         >
                           <Volume2 size={20} /> <span className="text-[10px] font-black uppercase tracking-widest">Beep</span>
                         </button>
                         <button
                            onClick={() => setAlertSettings(s => ({...s, type: 'voice'}))}
                            className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${alertSettings.type === 'voice' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                         >
                           <Mic size={20} /> <span className="text-[10px] font-black uppercase tracking-widest">AI Voice</span>
                         </button>
                         <button
                            onClick={() => setAlertSettings(s => ({...s, type: 'custom'}))}
                            className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center space-y-2 transition-all ${alertSettings.type === 'custom' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                         >
                           <Music size={20} /> <span className="text-[10px] font-black uppercase tracking-widest">Custom</span>
                         </button>
                       </div>

                       {alertSettings.type === 'voice' && (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.95 }}
                           animate={{ opacity: 1, scale: 1 }}
                           className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 space-y-4"
                         >
                           <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">AI Voice Phrase</label>
                           <textarea
                             className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-blue-500 resize-none transition-colors"
                             rows={3}
                             value={alertSettings.customVoiceText}
                             onChange={(e) => setAlertSettings(s => ({...s, customVoiceText: e.target.value}))}
                           />
                           <div className="flex justify-end">
                             <button 
                               onClick={handleGenerateVoice}
                               disabled={isGeneratingVoice}
                               className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl flex items-center space-x-3 disabled:opacity-50 transition-all font-bold text-xs"
                             >
                               {isGeneratingVoice ? <span>Generating...</span> : (
                                 <>
                                   <Activity size={16} />
                                   <span>Generate & Preview</span>
                                 </>
                               )}
                             </button>
                           </div>
                         </motion.div>
                       )}

                       {alertSettings.type === 'custom' && (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.95 }}
                           animate={{ opacity: 1, scale: 1 }}
                           className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 space-y-4"
                         >
                           <label className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">Upload Alert Audio</label>
                           <div className="flex items-center space-x-3">
                             <label className="flex-1 cursor-pointer bg-zinc-900 border border-zinc-800 hover:border-brand-emerald rounded-xl p-4 flex items-center justify-center space-x-3 transition-all group">
                               <Upload size={20} className="text-brand-emerald group-hover:scale-110 transition-transform" />
                               <span className="text-sm text-zinc-300 font-bold">Choose File</span>
                               <input 
                                 type="file" 
                                 accept="audio/*" 
                                 onChange={handleFileUpload} 
                                 className="hidden" 
                               />
                             </label>
                           </div>
                           {alertSettings.customAudioData && (
                             <div className="flex items-center justify-between bg-zinc-900/50 p-4 rounded-xl border border-zinc-800">
                               <span className="text-xs text-brand-emerald font-bold flex items-center"><Music size={14} className="mr-2"/> Audio Loaded</span>
                               <button 
                                 onClick={() => {
                                   if (audioContext.current && alertSettings.customAudioData) {
                                     playBase64Audio(alertSettings.customAudioData, audioContext.current);
                                   }
                                 }}
                                 className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                               >
                                 Preview
                               </button>
                             </div>
                           )}
                           <p className="text-[10px] text-zinc-600 font-medium text-center">Supported formats: MP3, WAV, OGG (Max 2MB)</p>
                         </motion.div>
                       )}
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
               
               <div className="pt-8 pb-4 text-center">
                 <p className="text-[10px] text-zinc-700 font-black uppercase tracking-[0.3em]">Velocity AI v1.2.0</p>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
};

export default App;