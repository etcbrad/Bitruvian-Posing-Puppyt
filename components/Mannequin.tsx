
import React, { useMemo, useCallback, useEffect } from 'react';
import { Bone } from './Bone';
import { ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT, RIGGING } from '../constants';
import { WalkingEnginePose, WalkingEngineProportions, WalkingEnginePivotOffsets, Vector2D, MaskTransform, GlobalPositions } from '../types';

interface MannequinProps {
  pose: WalkingEnginePose;
  pivotOffsets: WalkingEnginePivotOffsets & { l_hand_flash?: boolean; r_hand_flash?: boolean };
  props: WalkingEngineProportions;
  showPivots: boolean;
  showLabels: boolean;
  baseUnitH: number;
  onAnchorMouseDown: (boneKey: keyof WalkingEnginePivotOffsets, clientX: number, e: React.MouseEvent) => void;
  draggingBoneKey: keyof WalkingEnginePivotOffsets | null;
  isPaused: boolean;
  pinningMode: 'none' | 'rightFoot' | 'dual';
  maskImage?: string | null;
  maskTransform?: MaskTransform;
  isGhost?: boolean;
  overrideProps?: WalkingEngineProportions;
  onPositionsUpdate?: (positions: GlobalPositions) => void;
  pinnedJointKey?: keyof WalkingEnginePivotOffsets | null;
}

const RENDER_ORDER: (keyof WalkingEngineProportions)[] = [
    'waist', 'torso', 'l_upper_leg', 'r_upper_leg', 'l_lower_leg', 'r_lower_leg', 'l_foot', 'r_foot', 'l_toe', 'r_toe', 
    'collar', 'head', 'l_upper_arm', 'r_upper_arm', 'l_lower_arm', 'r_lower_arm', 'l_hand', 'r_hand'
];

export const partDefinitions: Record<keyof WalkingEngineProportions, any> = {
    head: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD_WIDTH, variant: 'head-tall-oval', drawsUpwards: true, label: 'Head', boneKey: 'neck' },
    collar: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR_WIDTH, variant: 'collar-horizontal-oval-shape', drawsUpwards: true, label: 'Collar', boneKey: 'collar' },
    torso: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO_WIDTH, variant: 'torso-teardrop-pointy-down', drawsUpwards: true, label: 'Torso', boneKey: 'torso' },
    waist: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST_WIDTH, variant: 'waist-teardrop-pointy-up', drawsUpwards: true, label: 'Waist', boneKey: 'waist' },
    r_upper_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_ARM, variant: 'deltoid-shape', label: 'R.Bicep', boneKey: 'r_shoulder' },
    r_lower_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_FOREARM, variant: 'limb-tapered', label: 'R.Forearm', boneKey: 'r_elbow' },
    r_hand: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND_WIDTH, variant: 'hand-foot-arrowhead-shape', label: 'R.Hand', boneKey: 'r_hand' },
    l_upper_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_ARM, variant: 'deltoid-shape', label: 'L.Bicep', boneKey: 'l_shoulder' },
    l_lower_arm: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_FOREARM, variant: 'limb-tapered', label: 'L.Forearm', boneKey: 'l_elbow' },
    l_hand: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HAND_WIDTH, variant: 'hand-foot-arrowhead-shape', label: 'L.Hand', boneKey: 'l_hand' },
    r_upper_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_THIGH, variant: 'limb-tapered', label: 'R.Thigh', boneKey: 'r_hip' },
    r_lower_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_CALF, variant: 'limb-tapered', label: 'R.Calf', boneKey: 'r_knee' },
    r_foot: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT_WIDTH, variant: 'foot-block-shape', label: 'R.Foot', boneKey: 'r_foot' },
    r_toe: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE_WIDTH, variant: 'toe-rounded-cap', label: 'R.Toe', boneKey: 'r_toe' },
    l_upper_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_THIGH, variant: 'limb-tapered', label: 'L.Thigh', boneKey: 'l_hip' },
    l_lower_leg: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LIMB_WIDTH_CALF, variant: 'limb-tapered', label: 'L.Calf', boneKey: 'l_knee' },
    l_foot: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT_WIDTH, variant: 'foot-block-shape', label: 'L.Foot', boneKey: 'l_foot' },
    l_toe: { rawH: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE, rawW: ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TOE_WIDTH, variant: 'toe-rounded-cap', label: 'L.Toe', boneKey: 'l_toe' },
};

const rotateVec = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
const addVec = (v1: Vector2D, v2: Vector2D): Vector2D => ({ x: v1.x + v2.x, y: v1.y + v2.y });

export const Mannequin: React.FC<MannequinProps> = ({
  pose, pivotOffsets, props, showPivots, showLabels, baseUnitH,
  onAnchorMouseDown, draggingBoneKey, isPaused, pinningMode,
  maskImage, maskTransform, isGhost = false, overrideProps, onPositionsUpdate, pinnedJointKey
}) => {
    const activeProps = overrideProps || props;

    const getScaledDimension = useCallback((raw: number, key: keyof WalkingEngineProportions, axis: 'w' | 'h') => {
        return raw * baseUnitH * (activeProps[key]?.[axis] || 1);
    }, [activeProps, baseUnitH]);

    const globalTransforms: GlobalPositions = useMemo(() => {
        const trans: GlobalPositions = {};
        const getRot = (key: string) => ((pose as any)[key] || 0) + ((pivotOffsets as any)[key] || 0);

        const waistLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.WAIST, 'waist', 'h');
        const waistRot = getRot('waist');
        trans.waist = { position: { x: 0, y: 0 }, rotation: waistRot };

        const torsoLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.TORSO, 'torso', 'h');
        const torsoRot = waistRot + getRot('torso');
        trans.torso = { position: addVec(trans.waist.position, rotateVec({ x: 0, y: -waistLen }, waistRot)), rotation: torsoRot };

        const collarLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.COLLAR, 'collar', 'h');
        const collarRot = torsoRot + getRot('collar');
        trans.collar = { position: addVec(trans.torso.position, rotateVec({ x: 0, y: -torsoLen }, torsoRot)), rotation: collarRot };
        
        const neckRot = collarRot + getRot('neck');
        trans.head = { position: addVec(trans.collar.position, rotateVec({ x: 0, y: -collarLen }, collarRot)), rotation: neckRot };

        ['r', 'l'].forEach(side => {
            const sx = (side === 'r' ? RIGGING.R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER : RIGGING.L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER) * baseUnitH;
            const baseShoulderRot = side === 'l' ? 90 : -90;
            const shRot = collarRot + baseShoulderRot + getRot(`${side}_shoulder`);
            const collarEnd = addVec(trans.collar!.position, rotateVec({ x: 0, y: -collarLen }, collarRot));
            const shPos = addVec(collarEnd, rotateVec({ x: sx, y: 0 }, collarRot));
            trans[`${side}_upper_arm` as keyof WalkingEngineProportions] = { position: shPos, rotation: shRot };
            const upLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.UPPER_ARM, `${side}_upper_arm` as any, 'h');
            const elRot = shRot + getRot(`${side}_elbow`);
            const elPos = addVec(shPos, rotateVec({ x: 0, y: upLen }, shRot));
            trans[`${side}_lower_arm` as keyof WalkingEngineProportions] = { position: elPos, rotation: elRot };
            const handRot = elRot + getRot(`${side}_hand`);
            const lowLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LOWER_ARM, `${side}_lower_arm` as any, 'h');
            trans[`${side}_hand` as keyof WalkingEngineProportions] = { position: addVec(elPos, rotateVec({ x: 0, y: lowLen }, elRot)), rotation: handRot };
        });

        ['r', 'l'].forEach(side => {
            const hipRot = waistRot + getRot(`${side}_hip`);
            trans[`${side}_upper_leg` as keyof WalkingEngineProportions] = { position: trans.waist!.position, rotation: hipRot };
            const thighLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER, `${side}_upper_leg` as any, 'h');
            const kneeRot = hipRot + getRot(`${side}_knee`);
            const kneePos = addVec(trans.waist!.position, rotateVec({ x: 0, y: thighLen }, hipRot));
            trans[`${side}_lower_leg` as keyof WalkingEngineProportions] = { position: kneePos, rotation: kneeRot };
            const calfLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER, `${side}_lower_leg` as any, 'h');
            const ankleRot = kneeRot + getRot(`${side}_foot`);
            const anklePos = addVec(kneePos, rotateVec({ x: 0, y: calfLen }, kneeRot));
            trans[`${side}_foot` as keyof WalkingEngineProportions] = { position: anklePos, rotation: ankleRot };
            const footLen = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT, `${side}_foot` as any, 'h');
            const toeRot = ankleRot + getRot(`${side}_toe`);
            trans[`${side}_toe` as keyof WalkingEngineProportions] = { position: addVec(anklePos, rotateVec({ x: 0, y: footLen }, ankleRot)), rotation: toeRot };
        });

        return trans;
    }, [pose, pivotOffsets, getScaledDimension, baseUnitH]);

    useEffect(() => {
        if (onPositionsUpdate) {
            onPositionsUpdate(globalTransforms);
        }
    }, [globalTransforms, onPositionsUpdate]);


    const ghostStyles = isGhost ? "opacity-30 pointer-events-none" : "";

    return (
        <g className={ghostStyles}>
            {RENDER_ORDER.map(partKey => {
                const p = partDefinitions[partKey];
                const t = globalTransforms[partKey];
                if (!p || !t) return null;

                let colorClass: string;
                if(isGhost) {
                    colorClass = "fill-sky-200/50 stroke-sky-400/50";
                } else if (partKey === 'collar') {
                    colorClass = 'fill-olive';
                } else if (partKey === 'l_hand' && pivotOffsets.l_hand_flash) {
                    colorClass = 'fill-accent-red';
                } else if (partKey === 'r_hand' && pivotOffsets.r_hand_flash) {
                    colorClass = 'fill-accent-red';
                } else {
                    colorClass = 'fill-mono-dark';
                }


                const headH = getScaledDimension(ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.HEAD, 'head', 'h');

                return (
                    <g key={partKey} transform={`translate(${t.position.x}, ${t.position.y}) rotate(${t.rotation})`}>
                        <Bone 
                            rotation={0}
                            length={getScaledDimension(p.rawH, partKey, 'h')}
                            width={getScaledDimension(p.rawW, partKey, 'w')}
                            variant={p.variant}
                            drawsUpwards={p.drawsUpwards}
                            label={p.label}
                            boneKey={p.boneKey}
                            proportionKey={partKey}
                            showPivots={showPivots && !isGhost}
                            showLabel={showLabels && !isGhost}
                            onAnchorMouseDown={onAnchorMouseDown}
                            onBodyMouseDown={onAnchorMouseDown}
                            isBeingDragged={!isGhost && draggingBoneKey === p.boneKey}
                            isPausedAndPivotsVisible={true} 
                            colorClass={colorClass}
                            isPinned={p.boneKey === pinnedJointKey && !isGhost}
                        />
                        {partKey === 'head' && maskImage && maskTransform && !isGhost && (
                          <g transform={`translate(${maskTransform.x}, ${maskTransform.y - headH/2}) rotate(${maskTransform.rotation}) scale(${maskTransform.scale})`}>
                            <image 
                              href={maskImage} 
                              x="-50" y="-50" width="100" height="100" 
                              preserveAspectRatio="xMidYMid meet"
                              className="pointer-events-none drop-shadow-lg"
                            />
                          </g>
                        )}
                    </g>
                );
            })}
        </g>
    );
};
