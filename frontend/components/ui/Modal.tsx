"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";

export const Modal = ({
    isOpen,
    onClose,
    children
}: {
    isOpen: boolean,
    onClose: () => void,
    children: React.ReactNode
}) => {
    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative bg-card text-card-foreground p-6 rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border"
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </motion.div>
        </div>,
        document.body
    );
};
