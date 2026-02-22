import { supabase, isSupabaseConfigured } from './supabase';
import { SpeedData, SpeedCamera, Unit, AlertSettings } from '../../types';

export const syncSettings = async (settings: {
  unit: Unit;
  speedLimit: number;
  presets: number[];
  violationCount: number;
  timeOverLimit: number;
  alertSettings: AlertSettings;
}) => {
  if (!isSupabaseConfigured()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      unit: settings.unit,
      speed_limit: settings.speedLimit,
      presets: settings.presets,
      violation_count: settings.violationCount,
      time_over_limit: settings.timeOverLimit,
      alert_settings: settings.alertSettings,
      updated_at: new Date().toISOString(),
    });

  if (error) console.error('Error syncing settings:', error);
};

export const saveSpeedPoint = async (point: SpeedData) => {
  if (!isSupabaseConfigured()) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('speed_history')
    .insert({
      user_id: user.id,
      speed: point.speed,
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: new Date(point.timestamp).toISOString(),
    });

  if (error) console.error('Error saving speed point:', error);
};

export const saveCamera = async (camera: SpeedCamera) => {
  if (!isSupabaseConfigured()) return;
  const { data: { user } } = await supabase.auth.getUser();
  
  const { error } = await supabase
    .from('speed_cameras')
    .insert({
      id: camera.id,
      user_id: user?.id,
      latitude: camera.latitude,
      longitude: camera.longitude,
      speed_limit: camera.speedLimit,
      name: camera.name,
      created_at: new Date(camera.createdAt).toISOString(),
    });

  if (error) console.error('Error saving camera:', error);
};

export const fetchCameras = async (): Promise<SpeedCamera[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('speed_cameras')
    .select('*');

  if (error) {
    console.error('Error fetching cameras:', error);
    return [];
  }

  return data.map(cam => ({
    id: cam.id,
    latitude: cam.latitude,
    longitude: cam.longitude,
    speedLimit: cam.speed_limit,
    name: cam.name,
    createdAt: new Date(cam.created_at).getTime(),
  }));
};

export const fetchProfile = async () => {
  if (!isSupabaseConfigured()) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data;
};
