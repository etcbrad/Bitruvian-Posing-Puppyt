
import { BASE_ROTATIONS, RIGGING } from '../constants';
import { PartName, Pose, Vector2D, AnchorName } from '../types';

export const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

// Added for smoother, robotic transitions
export const easeInOutQuint = (t: number): number => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
};

// Added for physically plausible impact simulation
export const easeInQuint = (t: number): number => t * t * t * t * t;


// This function calculates the shortest angular difference between two angles (in degrees).
// It's robust for angles in any range, including those outside [-180, 180].
export const getShortestAngleDiffDeg = (currentDeg: number, startDeg: number): number => {
  let diff = currentDeg - startDeg;

  // Normalize diff to [-180, 180]
  // First, bring it to [0, 360)
  diff = ((diff % 360) + 360) % 360; 
  
  // Then, adjust to [-180, 180]
  if (diff > 180) {
    diff -= 360;
  }
  return diff;
};

// NOTE: This function is currently not used in App.tsx for direct drag updates.
// It would be used for interpolating between two full poses over time.
export const lerpAngleShortestPath = (a: number, b: number, t: number): number => {
  // Use 'a' and 'b' directly for interpolation, but calculate shortest difference based on normalized angles.
  // The 'return a + ...' part needs 'a' as the starting point.

  // Normalize angles to [0, 360) for consistent difference calculation
  const normalizeAngle0to360 = (angle: number): number => {
    return ((angle % 360) + 360) % 360;
  };

  let startAngle = normalizeAngle0to360(a);
  let endAngle = normalizeAngle0to360(b);

  let delta = endAngle - startAngle;

  // Adjust delta to be within [-180, 180] for shortest path
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  
  // Apply this shortest delta from the original 'a'
  return a + delta * t;
};

const rad = (deg: number): number => deg * Math.PI / 180;
const deg = (rad: number): number => rad * 180 / Math.PI;
const rotateVec = (x: number, y: number, angleDeg: number): Vector2D => {
  const r = rad(angleDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

export const getTotalRotation = (key: string, pose: Pose): number => (BASE_ROTATIONS[key as keyof typeof BASE_ROTATIONS] || 0) + ((pose as any)[key] || 0);

export const solve2DJointIK = (
    target: Vector2D, 
    rootPos: Vector2D, 
    len1: number, 
    len2: number,
    rootAngle: number,
): { angle1: number, angle2: number } | null => {
    const dx = target.x - rootPos.x;
    const dy = target.y - rootPos.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist > len1 + len2 || dist < Math.abs(len1 - len2)) {
        return null; // out of reach
    }

    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

    const angleToTarget = Math.atan2(dy, dx);
    const cosAngle1Arg = clamp((distSq + len1 * len1 - len2 * len2) / (2 * dist * len1), -1, 1);
    const angle1_internal = Math.acos(cosAngle1Arg);
    const angle1_global = angleToTarget - angle1_internal;

    const cosAngle2Arg = clamp((len1 * len1 + len2 * len2 - distSq) / (2 * len1 * len2), -1, 1);
    const angle2_internal = Math.acos(cosAngle2Arg);

    return {
        angle1: deg(angle1_global) - rootAngle,
        angle2: deg(Math.PI - angle2_internal),
    };
};


const calculateBoneGlobalPositions = (
  parentGlobalPos: Vector2D,
  parentGlobalAngle: number,
  boneTotalLocalRotation: number,
  boneLength: number,
  boneOffset: Vector2D = { x: 0, y: 0 },
  isUpwardDrawing: boolean = false
): { globalStartPoint: Vector2D; globalEndPoint: Vector2D; childInheritedGlobalAngle: number } => {
  const rotatedOffset = rotateVec(boneOffset.x, boneOffset.y, parentGlobalAngle);
  const globalStartPoint = addVec(parentGlobalPos, rotatedOffset);
  const boneGlobalAngleForItsBody = parentGlobalAngle + boneTotalLocalRotation;
  const y_direction = isUpwardDrawing ? -1 : 1;
  const boneVector = rotateVec(0, boneLength * y_direction, boneGlobalAngleForItsBody);
  const globalEndPoint = addVec(globalStartPoint, boneVector);
  const childInheritedGlobalAngle = parentGlobalAngle + boneTotalLocalRotation;
  return { globalStartPoint, globalEndPoint, childInheritedGlobalAngle };
};

/**
 * Internal helper to calculate global positions of all joints, given a specific root position
 * and a body rotation angle for the entire figure.
 * This function does NOT apply pin compensation.
 */
const _calculateGlobalJointPositions = (
    baseRoot: Vector2D,
    baseBodyRotation: number, // The rotation applied to the entire body group around its root
    pose: Pose // The full pose object for individual bone rotations and offsets
): Record<string, Vector2D> => {
    const offsets = pose.offsets || {};

    // NOTE: ANATOMY is no longer directly imported; these lengths would need to be passed or derived
    // from a `baseUnitH` and `ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT` if this function were active.
    // Since this function is not actively used by the walking engine, these references remain dormant.
    const WAIST_LENGTH = 100; // Placeholder for original ANATOMY.WAIST
    const TORSO_LENGTH = 120; // Placeholder for original ANATOMY.TORSO
    const COLLAR_LENGTH = 40; // Placeholder for original ANATOMY.COLLAR
    const HEAD_LENGTH = 50; // Placeholder for original ANATOMY.HEAD
    const HEAD_NECK_GAP_OFFSET_LENGTH = 10; // Placeholder for original ANATOMY.HEAD_NECK_GAP_OFFSET
    const UPPER_ARM_LENGTH = 180; // Placeholder for original ANATOMY.UPPER_ARM
    const LOWER_ARM_LENGTH = 140; // Placeholder for original ANATOMY.LOWER_ARM
    const HAND_LENGTH = 80; // Placeholder for original ANATOMY.HAND
    const LEG_UPPER_LENGTH = 220; // Placeholder for original ANATOMY.LEG_UPPER
    const LEG_LOWER_LENGTH = 180; // Placeholder for original ANATOMY.LEG_LOWER
    const FOOT_LENGTH = 100; // Placeholder for original ANATOMY.FOOT

    const waistCalc = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(PartName.Waist, pose), WAIST_LENGTH, offsets[PartName.Waist], true);
    const torsoCalc = calculateBoneGlobalPositions(waistCalc.globalEndPoint, waistCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Torso, pose), TORSO_LENGTH, offsets[PartName.Torso], true);
    const collarCalc = calculateBoneGlobalPositions(torsoCalc.globalEndPoint, torsoCalc.childInheritedGlobalAngle, getTotalRotation(PartName.Collar, pose), COLLAR_LENGTH, offsets[PartName.Collar], true);
    const collarChildAngle = collarCalc.childInheritedGlobalAngle;
    const collarEnd = collarCalc.globalEndPoint;

    const headGapOffset = rotateVec(0, -HEAD_NECK_GAP_OFFSET_LENGTH, collarChildAngle);
    const headPivot = addVec(collarEnd, headGapOffset);
    const headGlobalAngle = collarChildAngle + getTotalRotation(PartName.Head, pose);
    const headTip = addVec(headPivot, rotateVec(0, -HEAD_LENGTH, headGlobalAngle));

    const getArmJoints = (isRight: boolean) => {
        const shoulderAttachX = isRight ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER;
        const shoulderAttach = addVec(collarEnd, rotateVec(shoulderAttachX, RIGGING.SHOULDER_Y_OFFSET_FROM_COLLAR_END, collarChildAngle));
        const upperArmCalc = calculateBoneGlobalPositions(shoulderAttach, collarChildAngle, getTotalRotation(isRight ? PartName.RShoulder : PartName.LShoulder, pose), UPPER_ARM_LENGTH, offsets[isRight ? PartName.RShoulder : PartName.LShoulder], false);
        const forearmCalc = calculateBoneGlobalPositions(upperArmCalc.globalEndPoint, upperArmCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rForearm' : 'lForearm', pose), LOWER_ARM_LENGTH, offsets[isRight ? PartName.RElbow : PartName.LElbow], false);
        const handGlobalAngle = forearmCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RWrist : PartName.LWrist, pose);
        const handTip = addVec(forearmCalc.globalEndPoint, rotateVec(0, HAND_LENGTH, handGlobalAngle));
        return { shoulder: shoulderAttach, elbow: upperArmCalc.globalEndPoint, wrist: forearmCalc.globalEndPoint, hand: handTip };
    };

    const getLegJoints = (isRight: boolean) => {
        const thighCalc = calculateBoneGlobalPositions(baseRoot, baseBodyRotation, getTotalRotation(isRight ? PartName.RThigh : PartName.LThigh, pose), LEG_UPPER_LENGTH, offsets[isRight ? PartName.RThigh : PartName.LThigh], false);
        const calfCalc = calculateBoneGlobalPositions(thighCalc.globalEndPoint, thighCalc.childInheritedGlobalAngle, getTotalRotation(isRight ? 'rCalf' : 'lCalf', pose), LEG_LOWER_LENGTH, offsets[isRight ? PartName.RSkin : PartName.LSkin], false);
        const ankleGlobalAngle = calfCalc.childInheritedGlobalAngle + getTotalRotation(isRight ? PartName.RAnkle : PartName.LAnkle, pose);
        const footTip = addVec(calfCalc.globalEndPoint, rotateVec(0, FOOT_LENGTH, ankleGlobalAngle));
        return { hip: baseRoot, knee: thighCalc.globalEndPoint, ankle: calfCalc.globalEndPoint, footTip };
    };

    const rArm = getArmJoints(true);
    const lArm = getArmJoints(false);
    const rLeg = getLegJoints(true);
    const lLeg = getLegJoints(false);

    return {
        root: baseRoot, // This is the base for the entire figure, typically the hip
        waist: baseRoot,
        torso: waistCalc.globalEndPoint,
        collar: torsoCalc.globalEndPoint,
        head: headPivot,
        rShoulder: rArm.shoulder,
        rElbow: rArm.elbow,
        rWrist: rArm.wrist,
        lShoulder: lArm.shoulder,
        lElbow: lArm.elbow,
        lWrist: lArm.wrist,
        rThigh: baseRoot,
        [PartName.RSkin]: rLeg.knee,
        rAnkle: rLeg.ankle,
        lThigh: baseRoot,
        [PartName.LSkin]: lLeg.knee,
        lAnkle: lLeg.ankle,
        headTip,
        rFootTip: rLeg.footTip,
        lFootTip: lLeg.footTip,
        rHandTip: rArm.hand,
        lHandTip: lArm.hand,
    };
};

/**
 * Main function to get global joint positions, applying pivot compensation if a non-root anchor is pinned.
 * No longer used by the walking engine, but kept to satisfy other components that might still implicitly rely on it.
 */
export const getJointPositions = (pose: Pose, activePin: AnchorName): Record<string, Vector2D> => {
    const inputRoot = pose.root;
    const inputBodyRotation = getTotalRotation('bodyRotation', pose); // The bodyRotation from the pose state

    // If the activePin is 'root' or a non-foot pin (e.g., waist, hand, head), no root compensation is needed for body rotation.
    // The rotation simply happens around the current pose.root as defined.
    // waist is considered synonymous with root for this purpose
    if (activePin === 'root' || activePin === PartName.Waist || ![PartName.LAnkle, PartName.RAnkle, 'lFootTip', 'rFootTip'].includes(activePin)) {
        return _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose);
    }

    // --- Calculate root compensation for foot-based pinning ---
    // 1. Get the pinned point's position if bodyRotation was 0 (relative to inputRoot)
    const jointsWithoutBodyRotation = _calculateGlobalJointPositions(inputRoot, 0, pose);
    const pinPositionWithoutRotation = jointsWithoutBodyRotation[activePin as keyof typeof jointsWithoutBodyRotation];

    // 2. Get the pinned point's position with the current bodyRotation (relative to inputRoot)
    const jointsWithBodyRotation = _calculateGlobalJointPositions(inputRoot, inputBodyRotation, pose);
    const pinPositionWithRotation = jointsWithBodyRotation[activePin as keyof typeof jointsWithBodyRotation];

    // 3. Calculate the required offset for the root
    // The target is `pinPositionWithoutRotation` (where the pin should be).
    // The current is `pinPositionWithRotation` (where the pin is if root doesn't move).
    // The difference is what the root needs to shift by.
    const rootCompensatoryOffset: Vector2D = {
        x: pinPositionWithoutRotation.x - pinPositionWithRotation.x,
        y: pinPositionWithoutRotation.y - pinPositionWithRotation.y,
    };

    // Apply the compensation to the inputRoot to get the actualRoot for rendering
    const actualRoot = addVec(inputRoot, rootCompensatoryOffset);

    // Finally, calculate all joints using the compensated actualRoot and the original body rotation
    return _calculateGlobalJointPositions(actualRoot, inputBodyRotation, pose);
};


export const getPartGlobalAngles = (pose: Pose) => {
  const angles: { [key: string]: number } = {};
  const bodyRotation = getTotalRotation('bodyRotation', pose);
  const waistGlobal = bodyRotation + getTotalRotation(PartName.Waist, pose);
  const torsoGlobal = waistGlobal + getTotalRotation(PartName.Torso, pose);
  const collarGlobal = torsoGlobal + getTotalRotation(PartName.Collar, pose);
  angles[PartName.Waist] = waistGlobal;
  angles[PartName.Torso] = torsoGlobal;
  angles[PartName.Collar] = collarGlobal;
  angles[PartName.Head] = collarGlobal + getTotalRotation(PartName.Head, pose);

  const processArm = (isRight: boolean) => {
    const sKey = isRight ? PartName.RShoulder : PartName.LShoulder;
    const fKey = isRight ? 'rForearm' : 'lForearm'; // Use string key for pose property
    const wKey = isRight ? PartName.RWrist : PartName.LWrist;
    const sAngle = collarGlobal + getTotalRotation(sKey, pose);
    const fAngle = sAngle + getTotalRotation(fKey, pose);
    const wAngle = fAngle + getTotalRotation(wKey, pose);
    angles[sKey] = sAngle;
    angles[isRight ? PartName.RElbow : PartName.LElbow] = fAngle; // Store global angle for elbow (end of bicep)
    angles[wKey] = wAngle;
  };
  processArm(true);
  processArm(false);

  const processLeg = (isRight: boolean) => {
    const tKey = isRight ? PartName.RThigh : PartName.LThigh;
    const cKey = isRight ? 'rCalf' : 'lCalf'; // Use string key for pose property
    const aKey = isRight ? PartName.RAnkle : PartName.LAnkle;
    const tAngle = bodyRotation + getTotalRotation(tKey, pose);
    const cAngle = tAngle + getTotalRotation(cKey, pose);
    const aAngle = cAngle + getTotalRotation(aKey, pose);
    angles[tKey] = tAngle;
    angles[isRight ? PartName.RSkin : PartName.LSkin] = cAngle; // Store global angle for knee (end of thigh)
    angles[aKey] = aAngle;
  };
  processLeg(true);
  processLeg(false);

  return angles;
};

// IK functions are no longer used by the walking engine's physics.
export const solveArmIK = (target: Vector2D, isRight: boolean, pose: Pose) => {
  const joints = getJointPositions(pose, 'root'); // Pass dummy activePin for IK calculation
  const sPos = isRight ? joints.rShoulder : joints.lShoulder;
  // NOTE: ANATOMY is no longer directly imported; these lengths would need to be passed or derived
  // from a `baseUnitH` and `ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT` if this function were active.
  const l1 = 180; // Placeholder for original ANATOMY.UPPER_ARM
  const l2 = 140; // Placeholder for original ANATOMY.LOWER_ARM
  const dx = target.x - sPos.x;
  const dy = target.y - sPos.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);
  // Max reach check for arm. Prevent IK if target is beyond reach.
  // Add a small tolerance to allow target slightly outside max length
  const MAX_ARM_DIST = l1 + l2 + 5; // Allow 5 units over max length
  if (dist > MAX_ARM_DIST || dist < Math.abs(l1 - l2)) return null; 

  const angleToTarget = Math.atan2(dy, dx);
  // Law of Cosines to find internal angles
  // Angle at shoulder (sAngleTri) relative to the line from shoulder to target
  const sAngleTri = Math.acos((l1 * l1 + distSq - l2 * l2) / (2 * l1 * dist));
  // Angle at elbow (eAngleTri)
  const eAngleTri = Math.acos((l1 * l1 + l2 * l2 - distSq) / (2 * l1 * l2));

  // Global angle of the upper arm
  const sGlobal = angleToTarget - sAngleTri;
  // Local angle of the forearm relative to upper arm
  const fLocal = Math.PI - eAngleTri; // 180 degrees - elbow angle for 'bent' appearance

  const collarAngle = getPartGlobalAngles(pose)[PartName.Collar];
  return {
    shoulder: deg(sGlobal) - collarAngle - BASE_ROTATIONS[isRight ? PartName.RShoulder : PartName.LShoulder],
    forearm: deg(fLocal) - BASE_ROTATIONS[isRight ? 'rForearm' : 'lForearm']
  };
};

export const solveLegIK = (target: Vector2D, isRight: boolean, pose: Pose) => {
  const joints = getJointPositions(pose, 'root'); // Pass dummy activePin for IK calculation
  const hPos = isRight ? joints.rThigh : joints.lThigh;
  // NOTE: ANATOMY is no longer directly imported; these lengths would need to be passed or derived
  // from a `baseUnitH` and `ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT` if this function were active.
  const l1 = 220; // Placeholder for original ANATOMY.LEG_UPPER
  const l2 = 180; // Placeholder for original ANATOMY.LEG_LOWER
  const dx = target.x - hPos.x;
  const dy = target.y - hPos.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);
  // Max reach check for leg. Prevent IK if target is beyond reach.
  const MAX_LEG_DIST = l1 + l2 + 5; // Allow 5 units over max length
  if (dist > MAX_LEG_DIST || dist < Math.abs(l1 - l2)) return null; 

  const angleToTarget = Math.atan2(dy, dx);
  // Law of Cosines to find internal angles
  // Angle at hip (tAngleTri) relative to the line from hip to target
  const tAngleTri = Math.acos((l1 * l1 + distSq - l2 * l2) / (2 * l1 * dist));
  // Angle at knee (kAngleTri)
  const kAngleTri = Math.acos((l1 * l1 + l2 * l2 - distSq) / (2 * l1 * l2));

  // Global angle of the upper leg
  const tGlobal = angleToTarget - tAngleTri;
  // Local angle of the lower leg relative to upper leg
  const cLocal = Math.PI - kAngleTri; // 180 degrees - knee angle for 'bent' appearance

  const bodyRot = getTotalRotation('bodyRotation', pose);
  return {
    thigh: deg(tGlobal) - bodyRot - BASE_ROTATIONS[isRight ? PartName.RThigh : PartName.LThigh],
    calf: deg(cLocal) - BASE_ROTATIONS[isRight ? 'rCalf' : 'lCalf']
  };
};
