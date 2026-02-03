
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WalkingEnginePose, WalkingEnginePivotOffsets, WalkingEngineProportions, Vector2D, MaskTransform, GlobalPositions, JointModes, JointMode } from './types';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING } from './constants'; 
import { Mannequin } from './components/Mannequin';
import { SystemLogger } from './components/SystemLogger';

const T_POSE: WalkingEnginePivotOffsets = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: 0, r_shoulder: 0,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 0, r_hip: 0,
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0
};

const INITIAL_CHALLENGE_POSE: WalkingEnginePivotOffsets = {
  waist: 180, torso: 180, collar: 0, neck: 180,
  l_shoulder: -95, l_elbow: 180, l_hand: 180,
  r_shoulder: 95, r_elbow: 180, r_hand: 180,
  l_hip: 5, l_knee: 180, l_foot: 180, l_toe: 180,
  r_hip: -5, r_knee: 180, r_foot: 180, r_toe: 180
};

const DEFAULT_POSE: WalkingEnginePivotOffsets = {
  waist: 0, neck: 0, collar: 0, torso: 0,
  l_shoulder: -75, r_shoulder: 75,
  l_elbow: 0, r_elbow: 0,
  l_hand: 0, r_hand: 0,
  l_hip: 0, r_hip: 0,
  l_knee: 0, r_knee: 0,
  l_foot: 0, r_foot: 0,
  l_toe: 0, r_toe: 0
};

const RESTING_BASE_POSE: WalkingEnginePose = {
  waist: 0, neck: 0, collar: 0, torso: 0, 
  l_shoulder: 0, r_shoulder: 0, l_elbow: 0, r_elbow: 0, l_hand: 0, r_hand: 0, 
  l_hip: 0, r_hip: 0, l_knee: 0, r_knee: 0, l_foot: 0, r_foot: 0, l_toe: 0, r_toe: 0, 
  stride_phase: 0, y_offset: 0, x_offset: 0
};

const JOINT_KEYS: (keyof WalkingEnginePivotOffsets)[] = [
  'waist', 'torso', 'collar', 'neck',
  'l_shoulder', 'l_elbow', 'l_hand',
  'r_shoulder', 'r_elbow', 'r_hand',
  'l_hip', 'l_knee', 'l_foot', 'l_toe',
  'r_hip', 'r_knee', 'r_foot', 'r_toe'
];

const INITIAL_JOINT_MODES: JointModes = Object.fromEntries(
  JOINT_KEYS.map(key => [key, 'fk'])
) as JointModes;

const KINEMATIC_TREE: Record<keyof WalkingEnginePivotOffsets, (keyof WalkingEnginePivotOffsets)[]> = {
    waist: ['torso', 'l_hip', 'r_hip'],
    torso: ['collar'],
    collar: ['neck', 'l_shoulder', 'r_shoulder'],
    neck: [],
    l_shoulder: ['l_elbow'],
    l_elbow: ['l_hand'],
    l_hand: [],
    r_shoulder: ['r_elbow'],
    r_elbow: ['r_hand'],
    r_hand: [],
    l_hip: ['l_knee'],
    l_knee: ['l_foot'],
    l_foot: ['l_toe'],
    l_toe: [],
    r_hip: ['r_knee'],
    r_knee: ['r_foot'],
    r_foot: ['r_toe'],
    r_toe: []
};


const PROP_KEYS: (keyof WalkingEngineProportions)[] = [
  'head', 'collar', 'torso', 'waist',
  'l_upper_arm', 'l_lower_arm', 'l_hand',
  'r_upper_arm', 'r_lower_arm', 'r_hand',
  'l_upper_leg', 'l_lower_leg', 'l_foot', 'l_toe',
  'r_upper_leg', 'r_lower_leg', 'r_foot', 'r_toe'
];

const ATOMIC_PROPS = Object.fromEntries(PROP_KEYS.map(k => [k, { w: 1, h: 1 }])) as WalkingEngineProportions;

const PIVOT_TO_PART_MAP: Record<keyof WalkingEnginePivotOffsets, keyof WalkingEngineProportions> = {
  waist: 'waist', torso: 'torso', collar: 'collar', neck: 'head',
  l_shoulder: 'l_upper_arm', l_elbow: 'l_lower_arm', l_hand: 'l_hand',
  r_shoulder: 'r_upper_arm', r_elbow: 'r_lower_arm', r_hand: 'r_hand',
  l_hip: 'l_upper_leg', l_knee: 'l_lower_leg', l_foot: 'l_foot', l_toe: 'l_toe',
  r_hip: 'r_upper_leg', r_knee: 'r_lower_leg', r_foot: 'r_foot', r_toe: 'r_toe',
};


const snapOutEase = (t: number) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

interface HistoryState {
  pivotOffsets: WalkingEnginePivotOffsets;
  props: WalkingEngineProportions;
  timestamp: number;
  label?: string;
}

const rotateVec = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

const App: React.FC = () => {
  const [showPivots, setShowPivots] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [baseH] = useState(150);
  const [isConsoleVisible, setIsConsoleVisible] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<'pose' | 'props' | 'data'>('pose');
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [isPlayingTimelapse, setIsPlayingTimelapse] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [lHandFlash, setLHandFlash] = useState(false);
  const [rHandFlash, setRHandFlash] = useState(false);

  // Advanced View and Control State
  const [showAtomicUnits, setShowAtomicUnits] = useState(false);
  const [rootPosition, setRootPosition] = useState<Vector2D>({ x: 0, y: 0 });
  const [bodyRotation, setBodyRotation] = useState(0);
  const [pinnedJointKey, setPinnedJointKey] = useState<keyof WalkingEnginePivotOffsets>('waist');
  const [allJointPositions, setAllJointPositions] = useState<GlobalPositions>({});
  const [onionSkinData, setOnionSkinData] = useState<HistoryState | null>(null);

  // Image State
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [maskTransform, setMaskTransform] = useState<MaskTransform>({ x: 0, y: 0, rotation: 0, scale: 1 });
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundTransform, setBackgroundTransform] = useState<MaskTransform>({ x: 0, y: 0, rotation: 0, scale: 1 });

  // Core State
  const [pivotOffsets, setPivotOffsets] = useState<WalkingEnginePivotOffsets>(INITIAL_CHALLENGE_POSE);
  const [props, setProps] = useState<WalkingEngineProportions>(ATOMIC_PROPS);
  const [jointModes, setJointModes] = useState<JointModes>(INITIAL_JOINT_MODES);

  // Target Anomaly Pixel (Game logic)
  const [anomaly, setAnomaly] = useState<Vector2D | null>(null);
  const anomalyRef = useRef<Vector2D | null>(null);

  // History State
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [recordingHistory, setRecordingHistory] = useState<HistoryState[]>([]);
  const [keyframes, setKeyframes] = useState<HistoryState[]>([]);
  const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);
  
  // Interaction Ref
  const [draggingBoneKey, setDraggingBoneKey] = useState<keyof WalkingEnginePivotOffsets | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartPivotOffsetRef = useRef(0);
  const isInteractingRef = useRef(false);

  const addLog = (message: string) => {
    const logEntry: Partial<HistoryState> & { timestamp: number; label: string } = {
        timestamp: Date.now(),
        label: message,
    };
    setRecordingHistory(prev => [...prev.slice(-99), logEntry as HistoryState]);
  };

  const handleMaskUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onerror = () => addLog("ERR: Mask upload failed.");
      reader.onload = (readerEvent) => {
        const result = readerEvent.target?.result as string;
        if (result) {
          setMaskImage(result);
          addLog("IO: Mask image uploaded.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // AGENT: Implement this function based on AGENT_INSTRUCTIONS.md
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onerror = () => addLog("ERR: Background upload failed.");
      reader.onload = (readerEvent) => {
        const result = readerEvent.target?.result as string;
        if (result) {
          setBackgroundImage(result);
          addLog("IO: Background image uploaded.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const recordSnapshot = useCallback((label?: string) => {
    const currentState: HistoryState = {
      pivotOffsets: { ...pivotOffsets },
      props: JSON.parse(JSON.stringify(props)),
      timestamp: Date.now(),
      label
    };
    setRecordingHistory(prev => [...prev, currentState]);
  }, [pivotOffsets, props]);

  const saveToHistory = useCallback(() => {
    const currentState: HistoryState = {
      pivotOffsets: { ...pivotOffsets },
      props: JSON.parse(JSON.stringify(props)),
      timestamp: Date.now()
    };
    setHistory(prev => [...prev.slice(-49), currentState]);
    setRedoStack([]);
  }, [pivotOffsets, props]);

  const anomalySize = useMemo(() => {
    const rawW = ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_FOREARM;
    return rawW * baseH * props.l_lower_arm.w * 0.65;
  }, [baseH, props.l_lower_arm.w]);

  const spawnAnomaly = useCallback(() => {
    const centerX = 0;
    const centerY = -300; 
    const radius = 450; 
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius; 
    const newAnom = {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance
    };
    setAnomaly(newAnom);
    anomalyRef.current = newAnom;
  }, []);

  const awardTokens = useCallback(() => {
    const baseValue = Math.floor(Math.random() * 99) + 1;
    const zeros = Math.random() > 0.5 ? 100 : 1000;
    const gain = baseValue * zeros;
    setTokens(prev => prev + gain);
    addLog(`CURRENCY ACCRUED: +${gain} TOKENS.`);
  }, []);

  const handleAnomalyResolve = useCallback((side: 'left' | 'right') => {
    if (!anomalyRef.current) return;
    if (side === 'left') {
      setLHandFlash(true);
      setTimeout(() => setLHandFlash(false), 300);
    } else {
      setRHandFlash(true);
      setTimeout(() => setRHandFlash(false), 300);
    }
    awardTokens();
    spawnAnomaly();
  }, [spawnAnomaly, awardTokens]);

  const handleAnomalyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!anomalyRef.current) return;
    awardTokens();
    spawnAnomaly();
  };

  const checkCollisions = useCallback((currentPivotOffsets: WalkingEnginePivotOffsets, currentProps: WalkingEngineProportions) => {
    if (!anomalyRef.current || !isCalibrated) return;

    const getRot = (key: string) => ((currentPivotOffsets as any)[key] || 0);
    const getDim = (raw: number, key: keyof WalkingEngineProportions) => raw * baseUnitH * (currentProps[key]?.h || 1);
    const baseUnitH = 150;

    ['r', 'l'].forEach(side => {
        const waistRot = getRot('waist');
        const torsoRot = waistRot + getRot('torso');
        const collarRot = torsoRot + getRot('collar');
        const baseShoulderRot = side === 'l' ? 90 : -90;
        const shRot = collarRot + baseShoulderRot + getRot(`${side}_shoulder`);
        const waistLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, 'waist');
        const torsoLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, 'torso');
        const collarLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, 'collar');
        const upLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, `${side}_upper_arm` as any);
        const lowLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, `${side}_lower_arm` as any);
        const handLen = getDim(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, `${side}_hand` as any);
        let pos = { x: 0, y: -100 }; 
        pos = addVec(pos, rotateVec({ x: 0, y: -waistLen }, waistRot));
        pos = addVec(pos, rotateVec({ x: 0, y: -torsoLen }, torsoRot));
        const collarEnd = addVec(pos, rotateVec({ x: 0, y: -collarLen }, collarRot));
        const sx = (side === 'r' ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER) * baseUnitH;
        const shPos = addVec(collarEnd, rotateVec({ x: sx, y: 0 }, collarRot));
        const elPos = addVec(shPos, rotateVec({ x: 0, y: upLen }, shRot));
        const elRot = shRot + getRot(`${side}_elbow`);
        const wristPos = addVec(elPos, rotateVec({ x: 0, y: lowLen }, elRot));
        const handRot = elRot + getRot(`${side}_hand`);
        
        const collectionPoint = addVec(wristPos, rotateVec({ x: 0, y: handLen * 0.85 }, handRot));
        
        const collectionThreshold = anomalySize * 1.5;
        const dx = collectionPoint.x - anomalyRef.current!.x;
        const dy = collectionPoint.y - anomalyRef.current!.y;
        if (dx*dx + dy*dy < collectionThreshold * collectionThreshold) {
          handleAnomalyResolve(side === 'l' ? 'left' : 'right');
        }
    });
  }, [anomalySize, handleAnomalyResolve, isCalibrated]);

  useEffect(() => {
    if (!anomaly || !isCalibrated) return;
    const interval = setInterval(() => checkCollisions(pivotOffsets, props), 16);
    return () => clearInterval(interval);
  }, [anomaly, isCalibrated, pivotOffsets, props, checkCollisions]);

  const undo = useCallback(() => {
    if (history.length === 0 || isPlayingTimelapse) return;
    const previous = history[history.length - 1];
    const current: HistoryState = {
      pivotOffsets: { ...pivotOffsets },
      props: JSON.parse(JSON.stringify(props)),
      timestamp: Date.now()
    };
    setRedoStack(prev => [current, ...prev]);
    setHistory(prev => prev.slice(0, -1));
    setPivotOffsets(previous.pivotOffsets);
    setProps(previous.props);
    addLog("UNDO: System state reverted.");
  }, [history, pivotOffsets, props, isPlayingTimelapse]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || isPlayingTimelapse) return;
    const next = redoStack[0];
    const current: HistoryState = {
      pivotOffsets: { ...pivotOffsets },
      props: JSON.parse(JSON.stringify(props)),
      timestamp: Date.now()
    };
    setHistory(prev => [...prev, current]);
    setRedoStack(prev => prev.slice(1));
    setPivotOffsets(next.pivotOffsets);
    setProps(next.props);
    addLog("REDO: System state reapplied.");
  }, [redoStack, pivotOffsets, props, isPlayingTimelapse]);

  const handleLogClick = useCallback((log: HistoryState, index: number) => {
    setSelectedLogIndex(index);
    if (log.pivotOffsets) {
      setKeyframes(prev => [...prev, log]);
      addLog(`KEYFRAME ADDED: Pose from log #${index + 1}.`);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLogIndex !== null) {
            e.preventDefault();
            const deletedLog = recordingHistory[selectedLogIndex];
            setRecordingHistory(prev => prev.filter((_, i) => i !== selectedLogIndex));
            setSelectedLogIndex(null); 
            addLog(`LOG DELETED: "${deletedLog.label || `Pose @ ${new Date(deletedLog.timestamp).toLocaleTimeString()}`}" removed.`);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            if (e.shiftKey) redo(); else undo();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            redo();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLogIndex, recordingHistory, redo, undo]);

  const startCalibration = useCallback(() => {
    if (isCalibrated || isCalibrating || isPlayingTimelapse) return;
    saveToHistory();
    recordSnapshot("CALIBRATION_START");
    setIsCalibrating(true);
    addLog("SEQUENCE: CALIBRATION START...");
    const duration = 250;
    const startTime = performance.now();
    const startPose = { ...pivotOffsets };
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = snapOutEase(progress);
      const nextPose = { ...startPose };
      JOINT_KEYS.forEach(key => {
        nextPose[key] = startPose[key] + (T_POSE[key] - startPose[key]) * easedProgress;
      });
      setPivotOffsets(nextPose);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsCalibrating(false);
        setIsCalibrated(true);
        setIsConsoleVisible(true);
        recordSnapshot("CALIBRATION_END");
        addLog("SEQUENCE: SYSTEM ALIGNED.");
        // spawnAnomaly();
      }
    };
    requestAnimationFrame(animate);
  }, [isCalibrated, isCalibrating, pivotOffsets, saveToHistory, recordSnapshot, isPlayingTimelapse, spawnAnomaly]);

  const poseString = useMemo(() => {
    const poseData = JOINT_KEYS.map(k => `${k}:${Math.round(pivotOffsets[k])}`).join(';');
    const propData = PROP_KEYS.map(k => `${k}:h${props[k].h.toFixed(2)},w${props[k].w.toFixed(2)}`).join(';');
    return `POSE[${poseData}]|PROPS[${propData}]`;
  }, [pivotOffsets, props]);

  const handlePivotChange = useCallback((key: keyof WalkingEnginePivotOffsets, newValue: number) => {
    setPivotOffsets(currentOffsets => {
        const newOffsets = { ...currentOffsets };
        const originalValue = currentOffsets[key];
        const delta = newValue - originalValue;

        if (delta === 0) return currentOffsets;

        newOffsets[key] = newValue;

        const applyRecursiveEffect = (parentKey: keyof WalkingEnginePivotOffsets, appliedDelta: number) => {
            const parentMode = jointModes[parentKey];
            if (parentMode === 'fk') return;

            const children = KINEMATIC_TREE[parentKey];
            if (!children) return;

            let childDelta = 0;
            if (parentMode === 'bend') {
                childDelta = appliedDelta;
            } else if (parentMode === 'stretch') {
                childDelta = -appliedDelta;
            }

            children.forEach(childKey => {
                newOffsets[childKey] = (newOffsets[childKey] || 0) + childDelta;
                applyRecursiveEffect(childKey, childDelta);
            });
        };

        applyRecursiveEffect(key, delta);
        return newOffsets;
    });
  }, [jointModes]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (draggingBoneKey && !isPlayingTimelapse) {
      if (!isInteractingRef.current) {
        isInteractingRef.current = true;
      }
      const delta = (e.clientX - dragStartXRef.current) * 0.5;
      const newVal = dragStartPivotOffsetRef.current + delta;
      
      handlePivotChange(draggingBoneKey, newVal);
    }
  }, [draggingBoneKey, isPlayingTimelapse, handlePivotChange]);

  useEffect(() => {
    const handleUp = () => { 
      if (draggingBoneKey) recordSnapshot(`END_DRAG_${draggingBoneKey}`);
      setDraggingBoneKey(null); 
      isInteractingRef.current = false;
      window.removeEventListener('mousemove', handleDrag); 
      window.removeEventListener('mouseup', handleUp); 
    };
    if (draggingBoneKey) { 
      window.addEventListener('mousemove', handleDrag); 
      window.addEventListener('mouseup', handleUp); 
    }
    return () => { 
      window.removeEventListener('mousemove', handleDrag); 
      window.removeEventListener('mouseup', handleUp); 
    };
  }, [draggingBoneKey, handleDrag, recordSnapshot]);
  
    const handleSetPin = (boneKey: keyof WalkingEnginePivotOffsets) => {
        setPinnedJointKey(boneKey);
        addLog(`PIN SET: Puppet now pivots on ${boneKey.replace(/_/g, ' ')}.`);
    };

    const pinnedJointPosition = useMemo((): Vector2D => {
        const partKey = PIVOT_TO_PART_MAP[pinnedJointKey];
        if (!partKey || !allJointPositions[partKey]) {
            return { x: 0, y: 0 };
        }
        return allJointPositions[partKey]!.position;
    }, [pinnedJointKey, allJointPositions]);


  const copyToClipboard = () => {
    navigator.clipboard.writeText(poseString);
    addLog("IO: State string copied to clipboard.");
  };

  const saveToFile = () => {
    const blob = new Blob([poseString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bitruvian_pose_${Date.now()}.txt`;
    link.click();
    addLog("IO: Pose exported to file.");
  };

  const updateProp = (key: keyof WalkingEngineProportions, axis: 'w' | 'h', val: number) => {
    if (isPlayingTimelapse) return;
    setProps(p => ({ ...p, [key]: { ...p[key], [axis]: val } }));
  };

  const resetProps = () => {
    if (isPlayingTimelapse) return;
    saveToHistory();
    setProps(ATOMIC_PROPS);
    recordSnapshot("PROPS_RESET");
    addLog("COMMAND: Anatomical proportions reset.");
  };

  const setFixedPose = (p: WalkingEnginePivotOffsets, name: string) => {
    if (isPlayingTimelapse) return;
    saveToHistory();
    setPivotOffsets({ ...p });
    recordSnapshot(`SET_POSE_${name.toUpperCase()}`);
    addLog(`COMMAND: Applied ${name} state.`);
  };

  const handleModeChange = (key: keyof WalkingEnginePivotOffsets, mode: JointMode) => {
    setJointModes(prev => {
        const currentMode = prev[key];
        const newMode = currentMode === mode ? 'fk' : mode;
        return { ...prev, [key]: newMode };
    });
  };

  const playTimelapse = useCallback(() => {
    if (keyframes.length < 2 || isPlayingTimelapse) return;
    setIsPlayingTimelapse(true);
    addLog(`SEQUENCE: RECREATION OF ${keyframes.length} KEYFRAMES.`);
    const STEP_DURATION = 250; 
    const totalDuration = (keyframes.length - 1) * STEP_DURATION;
    const startTime = performance.now();
    const frame = (now: number) => {
      const elapsed = now - startTime;
      const progressTotal = Math.min(elapsed / totalDuration, 1);
      const totalSteps = keyframes.length - 1;
      const exactIndex = progressTotal * totalSteps;
      const i = Math.min(Math.floor(exactIndex), totalSteps - 1);
      const u = exactIndex - i;
      const startState = keyframes[i];
      const endState = keyframes[i + 1];
      const nextPivot: any = {};
      JOINT_KEYS.forEach(k => {
        nextPivot[k] = startState.pivotOffsets[k] + (endState.pivotOffsets[k] - startState.pivotOffsets[k]) * u;
      });
      const nextProps: any = {};
      PROP_KEYS.forEach(k => {
        nextProps[k] = {
          w: startState.props[k].w + (endState.props[k].w - startState.props[k].w) * u,
          h: startState.props[k].h + (endState.props[k].h - startState.props[k].h) * u,
        };
      });
      setPivotOffsets(nextPivot);
      setProps(nextProps);
      if (progressTotal < 1) {
        requestAnimationFrame(frame);
      } else {
        setIsPlayingTimelapse(false);
        addLog("SEQUENCE: KEYFRAME PLAYBACK COMPLETE.");
      }
    };
    requestAnimationFrame(frame);
  }, [keyframes, isPlayingTimelapse]);

  const exportRecordingJSON = useCallback(() => {
    const dataStr = JSON.stringify(recordingHistory, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bitruvian_history_${Date.now()}.json`;
    link.click();
    addLog("IO: Full rotation history exported as JSON.");
  }, [recordingHistory]);

  const clearHistory = () => {
    setRecordingHistory([]);
    addLog("COMMAND: Recording history cleared.");
  };

  const clearKeyframes = () => {
    setKeyframes([]);
    addLog("COMMAND: Keyframe sequence cleared.");
  };

  return (
    <div className="flex h-full w-full bg-paper font-mono text-ink overflow-hidden select-none">
      {isConsoleVisible && (
        <div className="w-96 border-r border-ridge bg-mono-darker p-4 flex flex-col gap-4 custom-scrollbar overflow-y-auto z-50">
          <div className="flex justify-between items-center border-b border-ridge pb-2">
            <h1 className="text-2xl font-archaic tracking-widest text-ink uppercase italic">Bitruvius.Core</h1>
            <div className="flex gap-1">
              <button onClick={undo} disabled={history.length === 0 || isPlayingTimelapse} title="Undo (Ctrl+Z)" className="p-1 hover:bg-selection-super-light disabled:opacity-20 rounded transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6-6M3 10l6 6"/></svg>
              </button>
              <button onClick={redo} disabled={redoStack.length === 0 || isPlayingTimelapse} title="Redo (Ctrl+Y)" className="p-1 hover:bg-selection-super-light disabled:opacity-20 rounded transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a8 8 0 0 0-8 8v2M21 10l-6-6M21 10l-6 6"/></svg>
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => setFixedPose(T_POSE, 'T-Pose')} 
                  className="text-sm px-3 py-2 border border-selection bg-selection text-paper font-bold hover:bg-selection-light transition-all uppercase tracking-widest text-center"
                >
                  ALIGN T-POSE
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowPivots(!showPivots)} className={`text-sm px-3 py-1 border transition-all ${showPivots ? 'bg-selection text-paper border-selection' : 'bg-paper/10 text-mono-mid border-ridge'}`}>ANCHORS: {showPivots ? 'ON' : 'OFF'}</button>
                    <button onClick={() => setShowAtomicUnits(!showAtomicUnits)} className={`text-sm px-3 py-1 border transition-all ${showAtomicUnits ? 'bg-selection text-paper border-selection' : 'bg-paper/10 text-mono-mid border-ridge'}`}>ATOMIC: {showAtomicUnits ? 'ON' : 'OFF'}</button>
                </div>
              </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFixedPose(DEFAULT_POSE, 'default')} disabled={isPlayingTimelapse} className="text-sm px-3 py-1 border border-ridge hover:bg-mono-dark disabled:opacity-50 transition-colors uppercase">Default</button>
              <button onClick={() => setFixedPose(INITIAL_CHALLENGE_POSE, 'state')} disabled={isPlayingTimelapse} className="text-sm px-3 py-1 border border-ridge hover:bg-mono-dark disabled:opacity-50 transition-colors uppercase">State</button>
            </div>
          </div>

          <div className="flex border-b border-ridge">
            {(['pose', 'props', 'data'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveControlTab(tab)} className={`flex-1 text-sm py-2 font-bold transition-colors ${activeControlTab === tab ? 'bg-mono-dark text-selection border-b-2 border-selection' : 'text-mono-mid opacity-50'}`}>{tab.toUpperCase()}</button>
            ))}
          </div>

          <div className="flex-grow">
            {activeControlTab === 'pose' && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left duration-200">
                <div className="text-xs font-bold text-mono-light uppercase border-b border-ridge pb-1">Root Controls (Pin: {pinnedJointKey})</div>
                 <div className="p-2 border border-ridge/50 rounded bg-white/30 space-y-2">
                    <div className="flex justify-between text-xs uppercase font-bold text-mono-light"><span>Root X</span><span>{rootPosition.x.toFixed(0)}</span></div>
                    <input type="range" min="-500" max="500" step="1" value={rootPosition.x} onChange={(e) => setRootPosition(p => ({...p, x: parseInt(e.target.value)}))} onMouseDown={() => {saveToHistory(); recordSnapshot('START_ROOT_X');}} onMouseUp={() => recordSnapshot('END_ROOT_X')} className="w-full accent-selection h-1 cursor-ew-resize"/>
                    <div className="flex justify-between text-xs uppercase font-bold text-mono-light"><span>Root Y</span><span>{rootPosition.y.toFixed(0)}</span></div>
                    <input type="range" min="-700" max="700" step="1" value={rootPosition.y} onChange={(e) => setRootPosition(p => ({...p, y: parseInt(e.target.value)}))} onMouseDown={() => {saveToHistory(); recordSnapshot('START_ROOT_Y');}} onMouseUp={() => recordSnapshot('END_ROOT_Y')} className="w-full accent-selection h-1 cursor-ew-resize"/>
                    <div className="flex justify-between text-xs uppercase font-bold text-mono-light"><span>Body Rotation</span><span>{bodyRotation.toFixed(0)}°</span></div>
                    <input type="range" min="-180" max="180" step="1" value={bodyRotation} onChange={(e) => setBodyRotation(parseInt(e.target.value))} onMouseDown={() => {saveToHistory(); recordSnapshot('START_BODY_ROT');}} onMouseUp={() => recordSnapshot('END_BODY_ROT')} className="w-full accent-selection h-1 cursor-ew-resize"/>
                 </div>
                <div className="text-xs font-bold text-mono-light uppercase border-b border-ridge pb-1">Skeletal Rotations</div>
                <div className="flex flex-col gap-2 pr-2 h-[400px] overflow-y-auto custom-scrollbar">
                  {JOINT_KEYS.map(k => (
                    <div key={k} className="group">
                      <div className="flex justify-between items-center text-sm uppercase font-bold text-mono-light group-hover:text-ink transition-colors mb-1">
                        <span className="truncate pr-2">{k.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => handleModeChange(k, 'bend')} className={`w-6 h-6 rounded-sm border text-xs font-bold ${jointModes[k] === 'bend' ? 'bg-selection text-paper border-selection' : 'bg-paper/50 border-ridge'}`}>B</button>
                            <button onClick={() => handleModeChange(k, 'stretch')} className={`w-6 h-6 rounded-sm border text-xs font-bold ${jointModes[k] === 'stretch' ? 'bg-selection text-paper border-selection' : 'bg-paper/50 border-ridge'}`}>S</button>
                            <span className="w-12 text-right">{Math.round(pivotOffsets[k])}°</span>
                        </div>
                      </div>
                      <input type="range" min="-180" max="180" step="1" disabled={isPlayingTimelapse} value={pivotOffsets[k]} onMouseDown={() => {saveToHistory(); recordSnapshot(`START_RANGE_${k}`);}} onChange={(e) => handlePivotChange(k, parseInt(e.target.value))} onMouseUp={() => recordSnapshot(`END_RANGE_${k}`)} className="w-full accent-selection h-1 cursor-ew-resize disabled:opacity-50" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeControlTab === 'props' && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right duration-200">
                <div className="text-xs font-bold text-mono-light uppercase border-b border-ridge pb-1 flex justify-between items-center">
                  <span>Anatomical Resizing</span>
                  <button onClick={resetProps} disabled={isPlayingTimelapse} className="text-xs text-selection hover:underline disabled:opacity-50">RESET</button>
                </div>
                <div className="flex flex-col gap-4 pr-2 h-[400px] overflow-y-auto custom-scrollbar">
                  {PROP_KEYS.map(k => (
                    <div key={k} className="p-2 border border-ridge/50 rounded bg-white/30 space-y-2">
                      <div className="text-sm font-bold uppercase text-ink">{k.replace(/_/g, ' ')}</div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs uppercase text-mono-light"><span>Height Scale</span><span>{props[k].h.toFixed(2)}x</span></div>
                        <input type="range" min="0.2" max="3" step="0.01" value={props[k].h} disabled={isPlayingTimelapse} onMouseDown={() => {saveToHistory(); recordSnapshot(`START_PROP_H_${k}`);}} onChange={e => updateProp(k, 'h', parseFloat(e.target.value))} onMouseUp={() => recordSnapshot(`END_PROP_H_${k}`)} className="w-full h-1 accent-mono-mid disabled:opacity-50" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs uppercase text-mono-light"><span>Width Scale</span><span>{props[k].w.toFixed(2)}x</span></div>
                        <input type="range" min="0.2" max="3" step="0.01" value={props[k].w} disabled={isPlayingTimelapse} onMouseDown={() => {saveToHistory(); recordSnapshot(`START_PROP_W_${k}`);}} onChange={e => updateProp(k, 'w', parseFloat(e.target.value))} onMouseUp={() => recordSnapshot(`END_PROP_W_${k}`)} className="w-full h-1 accent-mono-mid disabled:opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeControlTab === 'data' && (
              <div className="flex flex-col gap-4 animate-in fade-in duration-200">
                <div className="text-xs font-bold text-mono-light uppercase border-b border-ridge pb-1">Serialization</div>
                <textarea readOnly value={poseString} className="w-full text-sm bg-white border border-ridge p-2 font-mono custom-scrollbar resize-none h-40" />
                <div className="flex flex-col gap-2">
                  <button onClick={copyToClipboard} className="w-full text-sm px-3 py-2 border border-ridge font-bold bg-selection text-paper hover:bg-selection-light transition-colors">COPY STATE STRING</button>
                  <button onClick={saveToFile} className="w-full text-sm px-3 py-2 border border-ridge font-bold text-mono-mid hover:bg-mono-dark transition-colors">EXPORT FILE</button>
                </div>
              </div>
            )}
          </div>

          <SystemLogger 
              logs={recordingHistory} 
              isVisible={true} 
              onPlayTimelapse={playTimelapse} 
              onExportJSON={exportRecordingJSON} 
              onClearHistory={clearHistory} 
              historyCount={recordingHistory.length} 
              onLogMouseEnter={setOnionSkinData} 
              onLogMouseLeave={() => setOnionSkinData(null)}
              onLogClick={handleLogClick}
              selectedLogIndex={selectedLogIndex}
              keyframesCount={keyframes.length}
              onClearKeyframes={clearKeyframes}
          />

          {/* AGENT: These sections are hidden. See AGENT_INSTRUCTIONS.md to implement them. */}
          <div id="mask-controls-placeholder" className="pt-4 border-t border-ridge bg-white/10 p-2 rounded hidden">
            <div className="text-xs font-bold text-mono-light uppercase mb-2">Mask Overlay</div>
            <input type="file" accept="image/*" onChange={handleMaskUpload} className="hidden" id="mask-upload" />
            <label htmlFor="mask-upload" className="block text-center text-sm px-3 py-2 border border-ridge font-bold cursor-pointer hover:bg-mono-dark transition-colors mb-2 uppercase">
              {maskImage ? "Change Mask" : "Upload Mask"}
            </label>
            {maskImage && (
              <div className="space-y-2 animate-in fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-xs uppercase text-mono-light"><span>X Offset</span></div>
                    <input type="range" min="-100" max="100" value={maskTransform.x} onChange={e => setMaskTransform(t => ({...t, x: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs uppercase text-mono-light"><span>Y Offset</span></div>
                    <input type="range" min="-100" max="100" value={maskTransform.y} onChange={e => setMaskTransform(t => ({...t, y: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs uppercase text-mono-light"><span>Rotation</span><span>{maskTransform.rotation}°</span></div>
                  <input type="range" min="-180" max="180" value={maskTransform.rotation} onChange={e => setMaskTransform(t => ({...t, rotation: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                </div>
                <div>
                  <div className="flex justify-between text-xs uppercase text-mono-light"><span>Scale</span><span>{maskTransform.scale.toFixed(2)}x</span></div>
                  <input type="range" min="0.1" max="5" step="0.05" value={maskTransform.scale} onChange={e => setMaskTransform(t => ({...t, scale: parseFloat(e.target.value)}))} className="w-full h-1 accent-selection" />
                </div>
                <button onClick={() => setMaskImage(null)} className="w-full text-xs text-accent-red font-bold hover:underline py-1 uppercase">Remove Mask</button>
              </div>
            )}
          </div>

          <div id="background-controls-placeholder" className="pt-4 border-t border-ridge bg-white/10 p-2 rounded hidden">
            <div className="text-xs font-bold text-mono-light uppercase mb-2">Background Image</div>
            <input type="file" accept="image/*" onChange={handleBackgroundUpload} className="hidden" id="background-upload" />
            <label htmlFor="background-upload" className="block text-center text-sm px-3 py-2 border border-ridge font-bold cursor-pointer hover:bg-mono-dark transition-colors mb-2 uppercase">
              {backgroundImage ? "Change BG" : "Upload BG"}
            </label>
            {backgroundImage && (
              <div className="space-y-2 animate-in fade-in">
                 <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-xs uppercase text-mono-light"><span>X Offset</span></div>
                    <input type="range" min="-500" max="500" value={backgroundTransform.x} onChange={e => setBackgroundTransform(t => ({...t, x: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs uppercase text-mono-light"><span>Y Offset</span></div>
                    <input type="range" min="-500" max="500" value={backgroundTransform.y} onChange={e => setBackgroundTransform(t => ({...t, y: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs uppercase text-mono-light"><span>Rotation</span><span>{backgroundTransform.rotation}°</span></div>
                  <input type="range" min="-180" max="180" value={backgroundTransform.rotation} onChange={e => setBackgroundTransform(t => ({...t, rotation: parseInt(e.target.value)}))} className="w-full h-1 accent-selection" />
                </div>
                <div>
                  <div className="flex justify-between text-xs uppercase text-mono-light"><span>Scale</span><span>{backgroundTransform.scale.toFixed(2)}x</span></div>
                  <input type="range" min="0.1" max="5" step="0.05" value={backgroundTransform.scale} onChange={e => setBackgroundTransform(t => ({...t, scale: parseFloat(e.target.value)}))} className="w-full h-1 accent-selection" />
                </div>
                <button onClick={() => setBackgroundImage(null)} className="w-full text-xs text-accent-red font-bold hover:underline py-1 uppercase">Remove BG</button>
              </div>
            )}
          </div>

        </div>
      )}

      <div 
        className={`flex-1 relative flex items-center justify-center bg-paper p-8 overflow-hidden transition-all duration-500 ${isPlayingTimelapse ? 'cursor-wait' : (!isCalibrated && !isCalibrating ? 'cursor-pointer group/stage' : '')}`}
        onClick={() => !isCalibrated && !isCalibrating && startCalibration()}
      >
        <div className="absolute top-4 right-4 z-50 text-right flex flex-col items-end pointer-events-none">
          <div className="text-lg font-archaic tracking-widest text-ink/70">TOKENS:</div>
          <div className="text-4xl font-archaic text-ink tracking-[0.1em]">{tokens.toLocaleString()}</div>
        </div>

        {isPlayingTimelapse && <div className="absolute top-16 right-4 z-50 px-3 py-1 bg-selection text-paper text-sm font-bold tracking-[0.2em] animate-pulse rounded-sm border border-ridge/50">TIMELAPSE: ACTIVE</div>}
        
        <button onClick={(e) => { e.stopPropagation(); setIsConsoleVisible(!isConsoleVisible); }} disabled={!isCalibrated} className={`absolute top-4 left-4 z-50 p-2 rounded-full transition-all shadow-sm border ${!isCalibrated ? 'bg-mono-dark text-mono-light opacity-30 cursor-not-allowed border-ridge' : 'bg-mono-darker/50 text-ink hover:bg-selection-super-light border-ridge'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isConsoleVisible ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
        </button>

        {!isCalibrated && !isCalibrating && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-between p-16 md:p-24 bg-paper/5 pointer-events-none animate-in fade-in duration-700">
            <h2 className="text-6xl md:text-8xl font-archaic text-ink tracking-tighter leading-none uppercase animate-in slide-in-from-top-8 duration-1000">
              Bitruvian Posing Engine
            </h2>
            
            <p className="text-sm md:text-base text-mono-light font-mono tracking-[0.5em] uppercase opacity-70 animate-pulse">
              Click to meet your puppet
            </p>
          </div>
        )}
        
        <svg viewBox="-500 -700 1000 1400" className={`w-full h-full drop-shadow-xl overflow-visible relative z-0 transition-all duration-300 ${!isCalibrated ? 'scale-110' : ''}`}>
          {backgroundImage && (
            <image 
              id="background-image-renderer"
              href={backgroundImage}
              x="-500"
              y="-500"
              width="1000"
              height="1000"
              preserveAspectRatio="xMidYMid slice"
              transform={`translate(${backgroundTransform.x}, ${backgroundTransform.y}) rotate(${backgroundTransform.rotation}) scale(${backgroundTransform.scale})`}
              className="pointer-events-none"
            />
          )}
          <g transform={`translate(${rootPosition.x}, ${rootPosition.y})`} className="relative z-10">
              <g transform={`rotate(${bodyRotation}, ${pinnedJointPosition.x}, ${pinnedJointPosition.y})`}>
                 {onionSkinData && (
                    <Mannequin 
                        pose={RESTING_BASE_POSE}
                        pivotOffsets={onionSkinData.pivotOffsets}
                        props={onionSkinData.props}
                        isGhost={true}
                        showPivots={false} showLabels={false} baseUnitH={baseH}
                        onAnchorMouseDown={()=>{}} draggingBoneKey={null}
                        isPaused={true} pinningMode="none"
                    />
                )}
                 {showAtomicUnits && isCalibrated && (
                    <Mannequin 
                        pose={RESTING_BASE_POSE}
                        pivotOffsets={pivotOffsets}
                        props={props}
                        overrideProps={ATOMIC_PROPS}
                        isGhost={true}
                        showPivots={true} showLabels={false} baseUnitH={baseH}
                        onAnchorMouseDown={()=>{}} draggingBoneKey={null}
                        isPaused={true} pinningMode="none"
                    />
                )}
                <Mannequin 
                  pose={RESTING_BASE_POSE} 
                  pivotOffsets={{...pivotOffsets, l_hand_flash: lHandFlash, r_hand_flash: rHandFlash} as any} 
                  props={props} 
                  showPivots={showPivots && isCalibrated} 
                  showLabels={showLabels} 
                  baseUnitH={baseH} 
                  onAnchorMouseDown={(k, x, e) => {
                    if (!isCalibrated || isPlayingTimelapse) return;
                    if (e.shiftKey) {
                        e.stopPropagation();
                        handleSetPin(k);
                        return;
                    }
                    saveToHistory();
                    recordSnapshot(`START_DRAG_${k}`);
                    setDraggingBoneKey(k);
                    dragStartXRef.current = x;
                    dragStartPivotOffsetRef.current = pivotOffsets[k];
                  }} 
                  draggingBoneKey={draggingBoneKey} 
                  isPaused={true} 
                  pinningMode="none" 
                  maskImage={maskImage}
                  maskTransform={maskTransform}
                  onPositionsUpdate={setAllJointPositions}
                  pinnedJointKey={pinnedJointKey}
                />
            </g>
          </g>
          {anomaly && (
            <g transform={`translate(${anomaly.x}, ${anomaly.y})`} className="relative z-20">
              <rect x={-anomalySize / 2} y={-anomalySize / 2} width={anomalySize} height={anomalySize} className="fill-ink hover:fill-accent-red cursor-crosshair transition-colors animate-pulse" onClick={handleAnomalyClick} data-is-anomaly="true" />
              <rect x={(-anomalySize / 2) - 2} y={(-anomalySize / 2) - 2} width={anomalySize + 4} height={anomalySize + 4} className="fill-none stroke-ridge stroke-[0.5] pointer-events-none" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

export default App;
