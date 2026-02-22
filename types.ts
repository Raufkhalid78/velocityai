export enum Unit {
  KMH = 'km/h',
  MPH = 'mph',
  KNOTS = 'knots',
}

export interface SpeedData {
  timestamp: number;
  speed: number;
  latitude: number | null;
  longitude: number | null;
}

export interface SpeedCamera {
  id: string;
  latitude: number;
  longitude: number;
  createdAt: number;
  speedLimit?: number;
  name?: string;
}

export interface AlertSettings {
  enabled: boolean;
  aiEnabled: boolean;
  threshold: number;
  type: 'beep' | 'voice' | 'custom';
  customVoiceText: string;
  voiceAudioUrl: string | null;
  customAudioData: string | null;
}

export interface LocationState {
  speed: number; // in m/s
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  heading: number | null;
  address: string | null; // Added address field
}