"use client";

import { createPortal } from "react-dom";

export const TooltipPortal = ({ text, pos }: { text: string, pos: { top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number } }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div
            className="fixed z-[100] p-2 bg-black/90 text-white text-xs rounded shadow-lg break-words whitespace-pre-wrap overflow-y-auto"
            style={{
                ...(pos.bottom !== undefined ? { bottom: pos.bottom } : {}),
                ...(pos.top !== undefined ? { top: pos.top } : {}),
                ...(pos.left !== undefined ? { left: pos.left } : {}),
                ...(pos.right !== undefined ? { right: pos.right } : {}),
                maxWidth: pos.maxWidth,
                maxHeight: pos.maxHeight,
                backdropFilter: 'blur(4px)'
            }}
        >
            {text}
        </div>,
        document.body
    );
};

export const calculateTooltipPosition = (
    rect: DOMRect | null,
    clientX: number | null,
    clientY: number | null,
    followCursor: boolean
) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const MAX_WIDTH = 500; // Max allowed width if space permits
    const MIN_TOOLTIP_HEIGHT = 100;
    const SAFETY_MARGIN = 16;
    const CURSOR_OFFSET = 16;

    let left: number | undefined;
    let right: number | undefined;
    let maxWidth: number;

    let spaceAbove = 0;
    let spaceBelow = 0;
    let top: number | undefined;
    let bottom: number | undefined;

    // determine horizontal position and width constraint
    if (followCursor && clientX !== null && clientY !== null) {
        // Dynamic anchoring based on side of screen (left half vs right half)
        if (clientX > viewportWidth / 2) {
            // Anchor Right
            right = viewportWidth - clientX + CURSOR_OFFSET;
            // Prevent right from being negative (shouldn't happen with valid mouse), constrain left edge
            // Available width to the left of the cursor
            const availableSpace = clientX - SAFETY_MARGIN;
            maxWidth = Math.min(MAX_WIDTH, availableSpace);
        } else {
            // Anchor Left
            left = clientX + CURSOR_OFFSET;
            // Available width to the right of the cursor
            const availableSpace = viewportWidth - left - SAFETY_MARGIN;
            maxWidth = Math.min(MAX_WIDTH, availableSpace);
        }

        spaceAbove = clientY;
        spaceBelow = viewportHeight - clientY;

        // Prefer below
        if (spaceBelow > MIN_TOOLTIP_HEIGHT || spaceBelow > spaceAbove) {
            top = clientY + CURSOR_OFFSET;
            spaceBelow = spaceBelow - CURSOR_OFFSET - SAFETY_MARGIN;
        } else {
            bottom = viewportHeight - clientY + CURSOR_OFFSET;
            spaceAbove = spaceAbove - CURSOR_OFFSET - SAFETY_MARGIN;
        }
    } else if (rect) {
        // Element-based positioning (fallback or specific use cases)
        // Center-ish logic or similar simply-anchored logic could apply here. 
        // For simplicity reusing left-anchor logic but constrained.

        left = rect.left;
        if (left + MAX_WIDTH > viewportWidth) {
            // If it overflows right, shift it but stay simple for now as primary use case is cursor/touch
            left = Math.max(SAFETY_MARGIN, viewportWidth - MAX_WIDTH - SAFETY_MARGIN);
            maxWidth = Math.min(MAX_WIDTH, viewportWidth - left - SAFETY_MARGIN);
        } else {
            maxWidth = MAX_WIDTH;
        }

        spaceAbove = rect.top;
        spaceBelow = viewportHeight - rect.bottom;

        const preferBelow = spaceAbove < MIN_TOOLTIP_HEIGHT && spaceBelow > spaceAbove;

        if (preferBelow) {
            top = rect.bottom + 8;
            spaceBelow = spaceBelow - 8 - SAFETY_MARGIN;
        } else {
            bottom = viewportHeight - rect.top + 8;
            spaceAbove = spaceAbove - 8 - SAFETY_MARGIN;
        }
    } else {
        // Fallback should ideally not happen
        left = 0;
        maxWidth = 200;
        top = 0;
    }

    return {
        left,
        right,
        top,
        bottom,
        maxWidth,
        maxHeight: top !== undefined ? spaceBelow : spaceAbove
    };
};
