
import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Vector2D, PartName, WalkingEnginePivotOffsets, WalkingEngineProportions } from '../types';
// ANATOMY is no longer directly imported; dimensions come from props.

// Exported for use in Mannequin.tsx cloneElement
export interface BoneProps { 
  rotation: number;
  length: number; // Final scaled kinematic length
  width?: number; // Final scaled kinematic width
  variant?: 'diamond' | 'waist-teardrop-pointy-up' | 'torso-teardrop-pointy-down' | 'collar-horizontal-oval-shape' | 'deltoid-shape' | 'limb-tapered' | 'head-tall-oval' | 'hand-foot-arrowhead-shape' | 'foot-block-shape' | 'toe-rounded-cap';
  showPivots: boolean;
  visible?: boolean;
  offset?: Vector2D;
  children?: React.ReactNode;
  drawsUpwards?: boolean;
  colorClass?: string;
  showLabel?: boolean;
  label?: string;
  boneKey?: keyof WalkingEnginePivotOffsets; // Key to identify this bone for pivotOffsets
  proportionKey?: keyof WalkingEngineProportions; // Key to identify this bone for images/props
  onAnchorMouseDown?: (boneKey: keyof WalkingEnginePivotOffsets, clientX: number, e: React.MouseEvent) => void;
  onBodyMouseDown?: (boneKey: keyof WalkingEnginePivotOffsets, clientX: number, e: React.MouseEvent) => void;
  isBeingDragged?: boolean;
  isPausedAndPivotsVisible?: boolean;
  patternFillId?: string;
  isPinned?: boolean;
}

export const COLORS = {
  ANCHOR_RED: "#F87171", // Anchor dots explicitly red
  SELECTION: "#D1D5DB", // Light monochrome shade
  RIDGE: "#333333", // For wireframe stroke - kept dark
  PIN_HIGHLIGHT: "#E5E7EB", // Light monochrome for active pin - Changed to a lighter monochrome
  DEFAULT_FILL: "#000000", // Fallback / solid black for silhouette
  FOCUS_RING: "#E5E7EB", // Added focus ring color
};

// COLORS_BY_CATEGORY is no longer used for dynamic fill, as colorClass is passed directly.
export const COLORS_BY_CATEGORY: { [category: string]: string } = { 
  head: "#5A5A5A",
  hand: "#5A5A5A",
  foot: "#5A5A5A",
  
  bicep: "#3A3A3A",
  forearm: "#3A3A3A",
  collar: "#3A3A3A",
  torso: "#3A3A3A",
  waist: "#3A3A3A",
  thigh: "#3A3A3A",
  shin: "#3A3A3A",

  default: COLORS.DEFAULT_FILL,
};

export const Bone: React.FC<BoneProps> = ({
  rotation,
  length, // This is now the final scaled kinematic length
  width = 15, // This is now the final scaled kinematic width
  variant = 'diamond',
  showPivots = true,
  visible = true,
  offset = { x: 0, y: 0 },
  children,
  drawsUpwards = false,
  colorClass = "fill-mono-dark",
  showLabel = false,
  label,
  boneKey,
  proportionKey,
  onAnchorMouseDown,
  onBodyMouseDown,
  isBeingDragged = false,
  isPausedAndPivotsVisible = false,
  patternFillId,
  isPinned = false,
}) => {

  const getBonePath = (boneLength: number, boneWidth: number, variant: string, drawsUpwards: boolean): string => {
    const effectiveLength = drawsUpwards ? -boneLength : boneLength;
    const halfWidth = boneWidth / 2;

    switch (variant) {
      case 'head-tall-oval':
        const topWidth = boneWidth;
        const baseWidth = boneWidth * 0.4;
        const headEffectiveLength = -boneLength;
        return `M ${-baseWidth / 2},0 L ${baseWidth / 2},0 L ${topWidth / 2},${headEffectiveLength} L ${-topWidth / 2},${headEffectiveLength} Z`;

      case 'collar-horizontal-oval-shape':
        const collarVisHeight = boneLength;
        const collarBaseWidth = boneWidth;
        const collarTopWidth = collarBaseWidth * 0.5; 
        return `M ${collarBaseWidth / 2},0 C ${collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${collarTopWidth / 2},${-collarVisHeight} L ${-collarTopWidth / 2},${-collarVisHeight} C ${-collarTopWidth * 0.7},${-collarVisHeight * 0.6} ${-collarBaseWidth * 0.3},${-collarVisHeight * 0.3} ${-collarBaseWidth / 2},0 Z`;

      case 'waist-teardrop-pointy-up':
        const wHeight = boneLength;
        const wWidth = boneWidth;
        return `M ${wWidth / 2},0 L ${wWidth * 0.15},${-wHeight} L ${-wWidth * 0.15},${-wHeight} L ${-wWidth / 2},0 Z`;

      case 'torso-teardrop-pointy-down':
        const tHeight = boneLength;
        const tWidth = boneWidth;
        return `M ${tWidth * 0.3},0 C ${tWidth * 0.3},${-tHeight * 0.3} ${tWidth / 2},${-tHeight * 0.7} ${tWidth / 2},${-tHeight} L ${-tWidth / 2},${-tHeight} C ${-tWidth / 2},${-tHeight * 0.7} ${-tWidth * 0.3},${-tHeight * 0.3} ${-tWidth * 0.3},0 Z`;

      case 'deltoid-shape':
        const dHeight = boneLength;
        const shoulderWidth = boneWidth; 
        return `M ${shoulderWidth / 2} 0
                C ${shoulderWidth / 2} ${dHeight * 0.2} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                L 0 ${dHeight}
                L ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.7}
                C ${-shoulderWidth * 1.2 / 2} ${dHeight * 0.4} ${-shoulderWidth / 2} ${dHeight * 0.2} ${-shoulderWidth / 2} 0 Z`;

      case 'limb-tapered':
        const taperedWidth = boneWidth;
        const taperedEndWidth = taperedWidth * 0.65;
        return `M ${taperedWidth / 2},0 L ${taperedEndWidth / 2},${effectiveLength} L ${-taperedEndWidth / 2},${effectiveLength} L ${-taperedWidth / 2},0 Z`;
      
      case 'foot-block-shape':
        const footBaseW = boneWidth;
        const footEndW = boneWidth * 1.4; // Widens towards ball of foot
        return `M ${footBaseW / 2},0 L ${footEndW / 2},${effectiveLength} L ${-footEndW / 2},${effectiveLength} L ${-footBaseW / 2},0 Z`;

      case 'toe-rounded-cap':
        const toeBaseW = boneWidth * 1.4; // Matches foot end for seamless alignment
        return `M ${toeBaseW / 2},0 L 0,${effectiveLength} L ${-toeBaseW / 2},0 Z`;

      case 'hand-foot-arrowhead-shape':
        const handFootWidth = boneWidth;
        return `M ${-handFootWidth / 2},0 L ${handFootWidth / 2},0 L 0,${effectiveLength} Z`;

      default:
        const defaultWidth = boneWidth;
        const split = effectiveLength * 0.4;
        return `M 0 0 L ${defaultWidth / 2} ${split} L 0 ${effectiveLength} L ${-defaultWidth / 2} ${split} Z`;
    }
  };

  const visualEndPoint = drawsUpwards ? -length : length;
  const transform = (offset.x !== 0 || offset.y !== 0)
    ? `translate(${offset.x}, ${offset.y}) rotate(${rotation})`
    : `rotate(${rotation})`;

  const anchorCursorStyle = isPausedAndPivotsVisible && onAnchorMouseDown
    ? (isBeingDragged ? 'cursor-grabbing' : 'cursor-grab')
    : 'cursor-default';
    
  const bodyCursorStyle = isPausedAndPivotsVisible && onBodyMouseDown
    ? (isBeingDragged ? 'cursor-grabbing' : 'cursor-grab')
    : 'cursor-default';

  const boneStrokeColor = COLORS.RIDGE;
  const boneStrokeWidth = 0.5;

  return (
    <g transform={transform} className={colorClass}> {/* Apply fill class directly to the group */}
      {visible && (
        <React.Fragment>
          <path
            d={getBonePath(length, width, variant, drawsUpwards)}
            fill={patternFillId || "currentColor"}
            stroke={boneStrokeColor} // Dynamic stroke for highlighting
            strokeWidth={boneStrokeWidth} // Dynamic stroke width for highlighting
            paintOrder="stroke"
            className={bodyCursorStyle}
            onMouseDown={(e) => {
                if (isPausedAndPivotsVisible && onBodyMouseDown && boneKey) {
                    onBodyMouseDown(boneKey, e.clientX, e);
                }
            }}
          />
          {/* Overlay line for axis */}
          {showPivots && (
            <line x1="0" y1="0" x2="0" y2={visualEndPoint} stroke="rgba(150, 150, 150, 0.15)" strokeWidth="1" opacity={0.5} strokeLinecap="round" />
          )}
           {showLabel && label && (
            <text x={width / 2 + 5} y={visualEndPoint / 2} 
                  className="fill-mono-mid text-[7px] font-mono select-none opacity-40 tracking-tighter uppercase pointer-events-none"
                  data-is-label="true">
              {label}
            </text>
          )}
        </React.Fragment>
      )}

      <g transform={`translate(0, ${visualEndPoint})`}>{children}</g>

      {/* Anchor (red dot) at the start of the bone, always visible if showPivots */}
      {showPivots && visible && boneKey && onAnchorMouseDown && (
        <g>
          <circle 
            cx="0" cy="0" r={5} 
            fill={COLORS.ANCHOR_RED} 
            stroke="white" // Added white stroke for emphasis
            strokeWidth="1" // Added stroke width
            className={`drop-shadow-md ${anchorCursorStyle}`} 
            data-no-export="true"
            onMouseDown={(e) => isPausedAndPivotsVisible && onAnchorMouseDown(boneKey, e.clientX, e)}
          />
          {isPinned && (
              <circle
                  cx="0" cy="0" r={10}
                  fill="none"
                  stroke={COLORS.PIN_HIGHLIGHT}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  data-no-export="true"
              >
                  <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 0 0"
                      to="360 0 0"
                      dur="3s"
                      repeatCount="indefinite"
                  />
              </circle>
          )}
        </g>
      )}
    </g>
  );
};
