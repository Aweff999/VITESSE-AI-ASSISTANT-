// FIX: Add type definitions for the non-standard Web Speech API to resolve the "Cannot find name 'SpeechRecognition'" error.
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onstart: (this: SpeechRecognition, ev: Event) => any;
  onend: (this: SpeechRecognition, ev: Event) => any;
  onresult: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => any;
  onerror: (this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

import { GoogleGenAI, Chat } from "@google/genai";

// Ensure the API key is available.
// This will be automatically provided by the execution environment.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const chat: Chat = ai.chats.create({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: `You are an AI assistant created by "Vitesse," an F1 in Schools racing team. While you were designed to support them, your expertise is available to everyone.
    Your primary goal is to provide expert knowledge on all aspects of the F1 in Schools competition, including aerodynamics, engineering, CAD/CAM, and project management.

    You have knowledge about the "Vitesse" team, its members, and its branding:
    - Team Logo: The Vitesse team logo is bold and dynamic, with a strong sense of speed and power. Here’s a breakdown of its appearance:
      - Main Shape: The logo is based on the letter “V”, which is broad and angular, giving it a solid and powerful foundation.
      - Color Scheme: It uses fiery gradients of red, orange, and gold, creating a glowing metallic look. The warm colors give an energetic, racing, and intense feeling.
      - Design Elements: A sharp, lightning-like streak cuts through the middle of the "V", symbolizing speed, energy, and motion. The edges are pointed and sleek, enhancing the aggressive and futuristic vibe. The gradient shading and metallic reflections make it appear 3D and polished, almost like a badge or emblem.
      - Background: The logo is set against a blurred red-to-orange gradient, which gives the illusion of motion, like flames or fast movement, further reinforcing the speed theme.
    - Team Manager: Adam Harith
    - Design Engineer: Daeng Afnan
    - Manufacturing Engineer: Areef Zuhair. His hobbies are basketball and skateboarding. He loves to play the drums. His favorite food is pizza, his role models are his parents, his favorite subject is physics, and his favorite song is "Let Me Love You" by Justin Bieber.
    - Sponsorship Manager: Daniel Qawiem
    - Digital Media: Shaza Nur Hanani
    - Resource Manager: Adila
    - Instagram: You can follow the team on Instagram at https://www.instagram.com/vitesse.sti/

    Beyond your F1 in Schools expertise, you are a well-rounded source of information. Feel free to answer questions about:
    - Formula 1: Discuss drivers, teams, race tracks around the world, historical facts, and technical details.
    - General Knowledge: Share interesting facts on any topic.
    - World Events & Crises: Provide clear, concise summaries of current events when asked.

    Your personality is that of a knowledgeable, encouraging, and supportive expert. You are here to help anyone interested in F1 in Schools, Formula 1, or learning something new.`,
  },
});

// DOM element references
const appContainer = document.getElementById('app-container') as HTMLDivElement;
const chatHistory = document.getElementById('chat-history') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const speakerButton = document.getElementById('speaker-button') as HTMLButtonElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;
const mainContent = document.querySelector('main') as HTMLElement;
const originalInputPlaceholder = chatInput.placeholder;

// Text-to-Speech setup
const synth = window.speechSynthesis;
let isSpeechEnabled = true;
let voices: SpeechSynthesisVoice[] = []; // To store available voices

function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') {
        return;
    }
    voices = synth.getVoices();
}

if (!synth) {
    speakerButton.classList.add('hidden');
    isSpeechEnabled = false;
    console.warn("Speech Synthesis API not supported in this browser.");
} else {
    populateVoiceList(); // For browsers that load it synchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
}


// Speech Recognition setup
// FIX: Cast window to `any` to access non-standard `SpeechRecognition` and
// `webkitSpeechRecognition` properties, and rename the `SpeechRecognition` constant
// to `SpeechRecognitionAPI` to avoid a name collision with the `SpeechRecognition` type.
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;
let isRecording = false;
let speechEndTimeout: number | null = null; // Timer for auto-sending after pause

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isRecording = true;
    micButton.classList.add('recording');
    chatInput.placeholder = 'Listening...';
    chatInput.disabled = true;
    sendButton.disabled = true;
    if (speechEndTimeout) {
      clearTimeout(speechEndTimeout);
    }
  };

  recognition.onend = () => {
    isRecording = false;
    micButton.classList.remove('recording');
    chatInput.placeholder = originalInputPlaceholder;
    chatInput.disabled = false;
    sendButton.disabled = chatInput.value.trim().length === 0;

    if (speechEndTimeout) {
        clearTimeout(speechEndTimeout);
        speechEndTimeout = null;
    }

    // Automatically send the message if there's content
    if (chatInput.value.trim()) {
        chatForm.requestSubmit();
    }
  };

  recognition.onresult = (event) => {
    // Clear any existing timeout to auto-stop
    if (speechEndTimeout) {
        clearTimeout(speechEndTimeout);
    }

    let final_transcript = '';
    let interim_transcript = '';

    // Reconstruct the full transcript from the results array
    for (let i = 0; i < event.results.length; ++i) {
      const transcriptPart = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final_transcript += transcriptPart;
      } else {
        interim_transcript += transcriptPart;
      }
    }

    chatInput.value = final_transcript + interim_transcript;
    sendButton.disabled = chatInput.value.trim().length === 0;

    // If the last result is final, it means the user has likely paused.
    // Set a timeout to automatically stop and send the message.
    const lastResultIsFinal = event.results[event.results.length - 1].isFinal;
    if (lastResultIsFinal && chatInput.value.trim()) {
      speechEndTimeout = window.setTimeout(() => {
        if (recognition && isRecording) {
          recognition.stop();
        }
      }, 1000); // Wait 1 second after a sentence before sending
    }
  };


  recognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    addMessage('error', `Speech recognition error: ${event.error}. Please check microphone permissions.`);
    isRecording = false;
    micButton.classList.remove('recording');
    chatInput.placeholder = originalInputPlaceholder;
    chatInput.disabled = false;
    if (speechEndTimeout) {
        clearTimeout(speechEndTimeout);
        speechEndTimeout = null;
    }
  };

} else {
    // Hide mic button if API is not supported
    micButton.classList.add('hidden');
    console.warn("Speech Recognition API not supported in this browser.");
}


micButton.addEventListener('click', () => {
    if (!recognition) return;

    // Stop any ongoing speech when starting to record
    if (synth && isSpeechEnabled) {
        synth.cancel();
    }

    if (isRecording) {
        recognition.stop();
    } else {
        chatInput.value = ''; // Clear input before starting
        recognition.start();
    }
});

speakerButton.addEventListener('click', () => {
    isSpeechEnabled = !isSpeechEnabled;
    speakerButton.classList.toggle('muted', !isSpeechEnabled);
    speakerButton.setAttribute('aria-label', isSpeechEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech');
    
    // If speech is turned off, stop any currently playing speech
    if (!isSpeechEnabled) {
        synth.cancel();
    }
});


function addMessage(role: 'user' | 'model' | 'error', text: string) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', `${role}-message`);
  messageDiv.textContent = text;
  chatHistory.appendChild(messageDiv);
  // Scroll to the latest message
  mainContent.scrollTop = mainContent.scrollHeight;
}

function speakText(text: string) {
    if (!synth || !isSpeechEnabled) {
        return;
    }

    // Cancel any previous speech to avoid queueing up messages
    synth.cancel();

    // Remove asterisks before speaking to avoid reading them out loud
    const textToSpeak = text.replace(/\*/g, '');
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // The voice list might be empty on first load. If so, populate it.
    if (voices.length === 0) {
        populateVoiceList();
    }
    
    // Prioritize voices that sound robotic or have an English (GB) accent.
    const bestVoice = voices.find(voice => voice.name.toLowerCase().includes('robot')) ||
                    voices.find(voice => voice.lang === 'en-GB') || // Prioritize British English
                    voices.find(voice => voice.name.toLowerCase().includes('google') && voice.lang.startsWith('en')) ||
                    voices.find(voice => voice.lang.startsWith('en')); // Fallback to any English voice

    if (bestVoice) {
        utterance.voice = bestVoice;
    }

    // "cute, hyper small robot" effect, with a clearer English accent
    utterance.pitch = 1.4; // Lowered pitch for clarity
    utterance.rate = 1.0;  // Normal rate for clarity


    utterance.onerror = (event) => {
        const errorEvent = event as SpeechSynthesisErrorEvent;
        // The 'interrupted' error is expected when synth.cancel() is called intentionally.
        // We don't need to show a user-facing error for this.
        if (errorEvent.error === 'interrupted') {
            console.info("Speech synthesis was intentionally interrupted.");
            return;
        }
        console.error(`SpeechSynthesisUtterance.onerror - Error: ${errorEvent.error}`, event);
        addMessage('error', `Sorry, text-to-speech playback failed: ${errorEvent.error}.`);
    };

    synth.speak(utterance);
}


async function updateBackgroundImage(prompt: string) {
  try {
    // Reset opacity to fade out old image if any
    appContainer.style.setProperty('--dynamic-background-opacity', '0');

    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `A beautiful, scenic, high-quality photograph related to: "${prompt}"`,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '9:16', // Optimized for vertical mobile screens
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;

      // Set the CSS variables to apply the new background and fade it in
      appContainer.style.setProperty('--dynamic-background-image', `url(${imageUrl})`);
      appContainer.style.setProperty('--dynamic-background-opacity', '0.2');
    }
  } catch (error) {
    console.error("Error generating background image:", error);
    // If it fails, just don't show a background.
    appContainer.style.setProperty('--dynamic-background-opacity', '0');
  }
}

// Handle chat form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = chatInput.value.trim();

  if (!prompt) {
    return; // Don't send empty messages
  }

  // Disable form to prevent multiple submissions
  chatInput.value = '';
  chatInput.disabled = true;
  sendButton.disabled = true;
  micButton.disabled = true;

  addMessage('user', prompt);
  loadingIndicator.classList.remove('hidden');

  try {
    const response = await chat.sendMessage({ message: prompt });
    const modelResponseText = response.text;
    addMessage('model', modelResponseText);
    speakText(modelResponseText);
    
    // After getting the text response, update the background image
    updateBackgroundImage(prompt);

  } catch (error) {
    console.error("Error sending message to AI:", error);
    addMessage('error', 'Sorry, something went wrong. Please check your connection and try again.');
  } finally {
    // Re-enable form
    loadingIndicator.classList.add('hidden');
    chatInput.disabled = false;
    sendButton.disabled = false;
    micButton.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener('input', () => {
    sendButton.disabled = chatInput.value.trim().length === 0;
});

// Show a welcome message when the app loads
document.addEventListener('DOMContentLoaded', () => {
    const welcomeMessage = "Welcome! I'm the Vitesse AI Assistant. Ask me anything about the F1 in Schools competition, the Vitesse team, or even general Formula 1 knowledge. How can I help you today?";
    addMessage('model', welcomeMessage);
    speakText(welcomeMessage);
});
