"use client";

import { useRef, useState, useEffect } from "react";
import { TooltipPortal, calculateTooltipPosition } from "./Tooltip";

export const TruncatedText = ({
    text,
    tooltipText,
    className,
    as: Component = 'p',
    maxLines = 0,
    followCursor = true
}: {
    text: string,
    tooltipText?: string,
    className?: string,
    as?: React.ElementType,
    maxLines?: number,
    followCursor?: boolean
}) => {
    const ref = useRef<HTMLElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top?: number, bottom?: number, left?: number, right?: number, maxWidth?: number, maxHeight?: number }>({});

    const isTouchRef = useRef(false);

    useEffect(() => {
        const checkTruncation = () => {
            if (ref.current) {
                const { scrollHeight, clientHeight, scrollWidth, clientWidth } = ref.current;
                setIsTruncated(scrollHeight > clientHeight || scrollWidth > clientWidth);
            }
        };

        checkTruncation();
        // Re-check on window resize
        window.addEventListener('resize', checkTruncation);
        return () => window.removeEventListener('resize', checkTruncation);
    }, [text, maxLines, className, Component]);

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (isTouchRef.current) return;
        if (isTruncated && ref.current) {
            let pos;
            if (followCursor) {
                pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            } else {
                const rect = ref.current.getBoundingClientRect();
                pos = calculateTooltipPosition(rect, null, null, false);
            }
            setTooltipPos(pos);
            setShowTooltip(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (showTooltip && followCursor) {
            const pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            setTooltipPos(pos);
        }
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const handleTouchStart = () => {
        isTouchRef.current = true;
    };

    const handleClick = (e: React.MouseEvent) => {
        if (isTruncated) {
            // For touch devices (or if we just want to update position on click)
            // recalculate position based on click coordinates
            const pos = calculateTooltipPosition(null, e.clientX, e.clientY, true);
            setTooltipPos(pos);
            setShowTooltip(!showTooltip);
        }
    }

    return (
        <div
            className="relative flex min-h-0 min-w-0"
            onMouseLeave={handleMouseLeave}
            onMouseEnter={handleMouseEnter}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onClick={handleClick}
        >
            <Component
                ref={ref}
                className={`${className} break-words overflow-hidden text-ellipsis ${maxLines > 0 ? '' : 'h-full'}`}
                style={maxLines > 0 ? {
                    display: '-webkit-box',
                    WebkitLineClamp: maxLines,
                    WebkitBoxOrient: 'vertical'
                } : {}}
            >
                {text}
            </Component>

            {showTooltip && <TooltipPortal text={tooltipText || text} pos={tooltipPos} />}
        </div>
    );
};
