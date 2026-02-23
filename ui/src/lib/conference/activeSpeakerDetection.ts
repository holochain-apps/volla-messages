export interface SpeakerInfo {
  participantId: string;
  audioLevel: number; // 0-1 normalized
  isSpeaking: boolean;
  lastSpokeAt: number; // timestamp
}

export interface ActiveSpeakerDetectorOptions {
  speakingThreshold?: number;
  switchCooldown?: number;
  sampleInterval?: number;
  smoothingFactor?: number;
}

interface ParticipantAudioState {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  dataArray: Uint8Array;
  smoothedLevel: number;
  lastSpokeAt: number;
}

export class ActiveSpeakerDetector {
  private participants: Map<string, ParticipantAudioState> = new Map();
  private speakingThreshold: number;
  private switchCooldown: number;
  private sampleInterval: number;
  private smoothingFactor: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentActiveSpeaker: string | null = null;
  private lastSwitchTime: number = 0;
  private onSpeakerChange: ((speakerId: string | null, allSpeakers: SpeakerInfo[]) => void) | null = null;

  constructor(options: ActiveSpeakerDetectorOptions = {}) {
    this.speakingThreshold = options.speakingThreshold ?? 0.1;
    this.switchCooldown = options.switchCooldown ?? 500;
    this.sampleInterval = options.sampleInterval ?? 100;
    this.smoothingFactor = options.smoothingFactor ?? 0.3;
  }

  onActiveSpeakerChange(callback: (speakerId: string | null, allSpeakers: SpeakerInfo[]) => void): void {
    this.onSpeakerChange = callback;
  }

  addParticipant(participantId: string, stream: MediaStream): boolean {
    // Remove existing if present
    this.removeParticipant(participantId);

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn(`[ActiveSpeaker] No audio tracks for participant ${participantId}`);
      return false;
    }

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      // Don't connect to destination - we just want to analyze

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      this.participants.set(participantId, {
        audioContext,
        analyser,
        source,
        dataArray,
        smoothedLevel: 0,
        lastSpokeAt: 0,
      });

      // Start detection loop if not already running
      this.startDetection();

      return true;
    } catch (error) {
      console.error(`[ActiveSpeaker] Error adding participant ${participantId}:`, error);
      return false;
    }
  }

  removeParticipant(participantId: string): void {
    const state = this.participants.get(participantId);
    if (state) {
      try {
        state.source.disconnect();
        state.audioContext.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.participants.delete(participantId);

      // If removed participant was active speaker, clear it
      if (this.currentActiveSpeaker === participantId) {
        this.currentActiveSpeaker = null;
      }
    }

    // Stop detection if no participants
    if (this.participants.size === 0) {
      this.stopDetection();
    }
  }

  updateParticipantStream(participantId: string, stream: MediaStream): boolean {
    return this.addParticipant(participantId, stream);
  }

  getSpeakerInfo(): SpeakerInfo[] {
    const now = Date.now();
    const result: SpeakerInfo[] = [];

    this.participants.forEach((state, participantId) => {
      result.push({
        participantId,
        audioLevel: state.smoothedLevel,
        isSpeaking: state.smoothedLevel >= this.speakingThreshold,
        lastSpokeAt: state.lastSpokeAt,
      });
    });

    return result;
  }

  getActiveSpeaker(): string | null {
    return this.currentActiveSpeaker;
  }

  setActiveSpeaker(participantId: string | null): void {
    if (participantId !== this.currentActiveSpeaker) {
      const previousSpeaker = this.currentActiveSpeaker;
      this.currentActiveSpeaker = participantId;
      this.lastSwitchTime = Date.now();

      // Notify callback
      if (this.onSpeakerChange && previousSpeaker !== this.currentActiveSpeaker) {
        this.onSpeakerChange(this.currentActiveSpeaker, this.getSpeakerInfo());
      }
    }
  }

  private startDetection(): void {
    if (this.intervalId !== null) return;

    this.intervalId = setInterval(() => {
      this.detectActiveSpeaker();
    }, this.sampleInterval);
  }

  private stopDetection(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private detectActiveSpeaker(): void {
    const now = Date.now();
    let loudestId: string | null = null;
    let loudestLevel = 0;

    // Update audio levels for all participants
    this.participants.forEach((state, participantId) => {
      const level = this.getAudioLevel(state);

      // Apply exponential smoothing
      state.smoothedLevel =
        this.smoothingFactor * level + (1 - this.smoothingFactor) * state.smoothedLevel;

      // Track when last spoke
      if (state.smoothedLevel >= this.speakingThreshold) {
        state.lastSpokeAt = now;
      }

      // Track loudest
      if (state.smoothedLevel > loudestLevel && state.smoothedLevel >= this.speakingThreshold) {
        loudestId = participantId;
        loudestLevel = state.smoothedLevel;
      }
    });

    // Determine if we should switch active speaker
    const shouldSwitch =
      loudestId !== null &&
      loudestId !== this.currentActiveSpeaker &&
      now - this.lastSwitchTime >= this.switchCooldown;

    // Also switch if current speaker has been quiet for a while
    const currentSpeakerQuiet =
      this.currentActiveSpeaker !== null &&
      this.participants.has(this.currentActiveSpeaker) &&
      now - (this.participants.get(this.currentActiveSpeaker)?.lastSpokeAt ?? 0) > this.switchCooldown * 2;

    if (shouldSwitch || (currentSpeakerQuiet && loudestId !== null)) {
      const previousSpeaker = this.currentActiveSpeaker;
      this.currentActiveSpeaker = loudestId;
      this.lastSwitchTime = now;

      // Notify callback
      if (this.onSpeakerChange && previousSpeaker !== this.currentActiveSpeaker) {
        this.onSpeakerChange(this.currentActiveSpeaker, this.getSpeakerInfo());
      }
    }
  }

  private getAudioLevel(state: ParticipantAudioState): number {
    state.analyser.getByteFrequencyData(state.dataArray);

    // Calculate RMS (root mean square) for more accurate level
    let sum = 0;
    for (let i = 0; i < state.dataArray.length; i++) {
      const normalized = state.dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / state.dataArray.length);

    return Math.min(1, rms * 2); // Amplify a bit for sensitivity
  }

  destroy(): void {
    this.stopDetection();

    this.participants.forEach((state, participantId) => {
      try {
        state.source.disconnect();
        state.audioContext.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    this.participants.clear();
    this.currentActiveSpeaker = null;
    this.onSpeakerChange = null;
  }
}

export function createActiveSpeakerStore(options?: ActiveSpeakerDetectorOptions) {
  const detector = new ActiveSpeakerDetector(options);
  const subscribers = new Set<(value: { activeSpeaker: string | null; speakers: SpeakerInfo[] }) => void>();

  let currentValue = {
    activeSpeaker: null as string | null,
    speakers: [] as SpeakerInfo[],
  };

  detector.onActiveSpeakerChange((speakerId, allSpeakers) => {
    currentValue = {
      activeSpeaker: speakerId,
      speakers: allSpeakers,
    };
    subscribers.forEach((fn) => fn(currentValue));
  });

  return {
    subscribe(fn: (value: typeof currentValue) => void) {
      subscribers.add(fn);
      fn(currentValue);
      return () => subscribers.delete(fn);
    },
    addParticipant: detector.addParticipant.bind(detector),
    removeParticipant: detector.removeParticipant.bind(detector),
    updateParticipantStream: detector.updateParticipantStream.bind(detector),
    getSpeakerInfo: detector.getSpeakerInfo.bind(detector),
    setManualSpeaker: detector.setActiveSpeaker.bind(detector),
    destroy: detector.destroy.bind(detector),
  };
}
