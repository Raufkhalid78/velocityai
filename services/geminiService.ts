import { GoogleGenAI, Modality } from "@google/genai";

// Initialize Gemini Client
// Requires process.env.API_KEY to be set
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API Key is missing. TTS features will be disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateVoiceAlert = async (text: string): Promise<string | null> => {
  const ai = getClient();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say gently but firmly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore', 'Fenrir', 'Puck', 'Charon'
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data returned");
    }

    // Convert base64 to Blob URL
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/pcm;rate=24000' }); // Note: Raw PCM needs decoding usually, but for simple playback we might need a WAV header or decode via AudioContext.
    
    // Since browser <audio> cannot play raw PCM directly, we must decode it using AudioContext 
    // and then (optionally) re-encode to WAV or just play via AudioContext buffer.
    // However, to return a URL that <audio> can play is complex without a WAV header.
    // STRATEGY CHANGE: Return the ArrayBuffer and let the consumer play it via AudioContext.
    
    return base64Audio; // Return base64 to be decoded by consumer
  } catch (error) {
    console.error("Error generating voice alert:", error);
    return null;
  }
};

// Helper to decode and play audio for preview or alert
export const playBase64Audio = async (base64Data: string, audioContext: AudioContext) => {
  try {
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    try {
      // Try standard decoding (works if it's MP3/WAV/etc)
      const audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (decodeError) {
      // Fallback: Assume raw PCM 16-bit signed, mono, 24kHz (common Gemini TTS output)
      console.warn("Standard decoding failed, attempting raw PCM playback", decodeError);
      
      const pcmData = new Int16Array(bytes.buffer);
      const audioBuffer = audioContext.createBuffer(1, pcmData.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768.0; // Convert 16-bit int to float [-1, 1]
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
    }
  } catch (e) {
    console.error("Audio playback error", e);
  }
};
