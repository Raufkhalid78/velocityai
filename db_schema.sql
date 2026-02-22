-- Velocity AI Database Schema

-- 1. Profiles / User Settings
-- Stores global settings for the user
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    unit TEXT DEFAULT 'km/h',
    speed_limit INTEGER DEFAULT 60,
    presets INTEGER[] DEFAULT ARRAY[50, 80, 120],
    violation_count INTEGER DEFAULT 0,
    time_over_limit INTEGER DEFAULT 0,
    alert_settings JSONB DEFAULT '{
        "enabled": true,
        "aiEnabled": true,
        "threshold": 0,
        "type": "beep",
        "customVoiceText": "Please slow down, you are exceeding the speed limit."
    }'::JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Speed History
-- Stores historical speed data points
CREATE TABLE IF NOT EXISTS speed_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    speed FLOAT NOT NULL,
    latitude FLOAT,
    longitude FLOAT,
    accuracy FLOAT
);

-- 3. Speed Cameras
-- Stores reported speed camera locations
CREATE TABLE IF NOT EXISTS speed_cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    speed_limit INTEGER,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE speed_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE speed_cameras ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only see/edit their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Speed History: Users can only see/edit their own history
CREATE POLICY "Users can view own history" ON speed_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON speed_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Speed Cameras: Publicly viewable, but only creators can delete
CREATE POLICY "Cameras are viewable by everyone" ON speed_cameras FOR SELECT USING (true);
CREATE POLICY "Users can insert cameras" ON speed_cameras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cameras" ON speed_cameras FOR DELETE USING (auth.uid() = user_id);
