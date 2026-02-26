-- Add per-user Gemini settings for YouTube AI assistant.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gemini_model TEXT NOT NULL DEFAULT 'gemini-3-flash';
