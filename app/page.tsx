'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Loader2, Check, Copy, AlertCircle, History } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API
const getAI = () => new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

type Transcription = {
  id: string;
  text: string;
  timestamp: Date;
};

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [targetLanguage, setTargetLanguage] = useState('Português');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const processAudio = useCallback(async (audioBlob: Blob, mimeType: string, lang: string) => {
    setIsProcessing(true);
    try {
      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Extract the base64 string (remove "data:audio/webm;base64,")
        const base64String = base64data.split(',')[1];
        
        // Ensure mimeType is valid for Gemini, fallback to audio/webm if empty
        const cleanMimeType = mimeType.split(';')[0] || 'audio/webm';

        const ai = getAI();
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    data: base64String,
                    mimeType: cleanMimeType,
                  }
                },
                {
                  text: `Transcreva o áudio a seguir. A saída DEVE ser obrigatoriamente no idioma: ${lang}. Se o áudio estiver em outro idioma, traduza-o para ${lang}. Corrija quaisquer erros gramaticais, gagueiras ou palavras mal compreendidas para torná-lo claro e profissional. Retorne APENAS o texto final, sem comentários adicionais.`
                }
              ]
            }
          ],
          config: {
            systemInstruction: "You are an expert audio transcriber, translator, and editor. Your task is to provide highly accurate transcriptions, flawlessly translating if necessary, and perfectly correcting any grammatical errors, stutters, or misspoken words while maintaining the original meaning and tone. Output only the final text.",
            temperature: 0.2,
          }
        });

        const correctedText = response.text?.trim() || '';
        
        if (correctedText) {
          const newTranscription = {
            id: Date.now().toString(),
            text: correctedText,
            timestamp: new Date(),
          };
          setTranscriptions(prev => [newTranscription, ...prev]);
          
          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(correctedText);
            setCopiedId(newTranscription.id);
            setTimeout(() => setCopiedId(null), 2000);
          } catch (clipboardErr) {
            console.error('Failed to copy to clipboard:', clipboardErr);
            // Fallback for older browsers or strict permissions
            const textArea = document.createElement("textarea");
            textArea.value = correctedText;
            document.body.appendChild(textArea);
            textArea.select();
            try {
              document.execCommand('copy');
              setCopiedId(newTranscription.id);
              setTimeout(() => setCopiedId(null), 2000);
            } catch (err2) {
              console.error('Fallback copy failed', err2);
            }
            document.body.removeChild(textArea);
          }
        } else {
          setError('Não foi possível transcrever o áudio.');
        }
        setIsProcessing(false);
      };
    } catch (err) {
      console.error('Error processing audio:', err);
      setError('Ocorreu um erro ao processar o áudio com a IA.');
      setIsProcessing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        await processAudio(audioBlob, mediaRecorder.mimeType, targetLanguage);
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  }, [processAudio, targetLanguage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);


  // Handle Spacebar shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent scrolling
        if (!isRecording && !isProcessing) {
          startRecording();
        } else if (isRecording) {
          stopRecording();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, isProcessing, startRecording, stopRecording]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full flex flex-col items-center gap-12">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-100">Gravador Inteligente</h1>
          <p className="text-zinc-400 text-sm">
            Pressione <kbd className="px-2 py-1 bg-zinc-800 rounded-md text-zinc-300 font-mono text-xs mx-1 border border-zinc-700 shadow-sm">Espaço</kbd> para gravar. O áudio será transcrito, corrigido e copiado.
          </p>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-3 bg-zinc-900/50 p-1.5 rounded-full border border-zinc-800">
          {['Português', 'Inglês', 'Espanhol'].map((lang) => (
            <button
              key={lang}
              onClick={() => setTargetLanguage(lang)}
              disabled={isRecording || isProcessing}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                targetLanguage === lang
                  ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
              } ${(isRecording || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {lang}
            </button>
          ))}
        </div>

        {/* Main Recorder UI */}
        <div className="relative flex flex-col items-center justify-center w-64 h-64 my-8">
          {/* Pulsing background when recording */}
          <AnimatePresence>
            {isRecording && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 0.15 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full bg-red-500"
              />
            )}
          </AnimatePresence>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`relative z-10 flex items-center justify-center w-32 h-32 rounded-full transition-all duration-300 shadow-2xl ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20 scale-110' 
                : isProcessing
                  ? 'bg-zinc-800 cursor-not-allowed'
                  : 'bg-zinc-800 hover:bg-zinc-700 hover:scale-105 border border-zinc-700'
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-10 h-10 text-zinc-400 animate-spin" />
            ) : isRecording ? (
              <Square className="w-10 h-10 text-white fill-current" />
            ) : (
              <Mic className="w-12 h-12 text-zinc-300" />
            )}
          </button>

          {/* Timer & Status */}
          <div className="absolute -bottom-12 flex items-center justify-center gap-3 font-mono text-2xl tracking-wider text-zinc-400 w-full">
            {isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              />
            )}
            <span>{isRecording ? formatTime(recordingTime) : isProcessing ? 'Processando...' : '00:00'}</span>
          </div>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 text-red-400 bg-red-400/10 px-5 py-4 rounded-xl border border-red-400/20 text-sm w-full"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcriptions History */}
        {transcriptions.length > 0 && (
          <div className="w-full mt-8 space-y-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-6 border-b border-zinc-800 pb-3">
              <History className="w-4 h-4" />
              <h2 className="text-xs font-semibold uppercase tracking-widest">Histórico</h2>
            </div>
            
            <div className="space-y-4">
              {transcriptions.map((t) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 group hover:border-zinc-700 transition-colors"
                >
                  <div className="flex justify-between items-start gap-6">
                    <p className="text-zinc-300 leading-relaxed text-[15px] whitespace-pre-wrap">
                      {t.text}
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(t.text);
                          setCopiedId(t.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        } catch (err) {
                          console.error('Failed to copy text: ', err);
                          // Fallback for older browsers or strict permissions
                          const textArea = document.createElement("textarea");
                          textArea.value = t.text;
                          document.body.appendChild(textArea);
                          textArea.select();
                          try {
                            document.execCommand('copy');
                            setCopiedId(t.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          } catch (err2) {
                            console.error('Fallback copy failed', err2);
                          }
                          document.body.removeChild(textArea);
                        }
                      }}
                      className="shrink-0 p-2.5 rounded-xl bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all border border-zinc-700/50"
                      title="Copiar texto"
                    >
                      {copiedId === t.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="mt-4 text-xs text-zinc-600 font-mono">
                    {t.timestamp.toLocaleTimeString()}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
