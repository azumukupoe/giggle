"use client";

import { useRef, useState } from "react";
import { TooltipPortal, calculateTooltipPosition } from "./Tooltip";

export const TooltippedLink = ({
    href,
    title,
    children,
    className
}: {
    href: string,
    title?: string,
    children: React.ReactNode,
    className?: string
}) => {
    const ref = useRef<HTMLAnchorElement>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number }>({});
    const isTouchRef = useRef(false);

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (isTouchRef.current) return;
        if (title) {
            setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
            setShowTooltip(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (showTooltip) {
            setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const handleTouchStart = () => {
        isTouchRef.current = true;
    };

    const handleClick = (e: React.MouseEvent) => {
        // Reset touch flag on click to ensure subsequent interactions are handled correctly if device capabilities change
        // But for this interaction:
        if (isTouchRef.current) {
            if (!showTooltip && title) {
                e.preventDefault();
                setTooltipPos(calculateTooltipPosition(null, e.clientX, e.clientY, true));
                setShowTooltip(true);
            }
            // If tooltip is already shown, allow default (navigation)
        }
    };

    return (
        <>
            <a
                ref={ref}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
                onMouseEnter={handleMouseEnter}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onClick={handleClick}
            >
                {children}
            </a>
            {showTooltip && title && <TooltipPortal text={title} pos={tooltipPos} />}
        </>
    );
};
