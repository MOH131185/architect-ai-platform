
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

const FinalizingAnimation = ({ className = "w-full h-32" }) => {
    return (
        <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                transition={{ duration: 0.8, ease: "backOut" }}
                className="text-emerald-500 relative z-10"
            >
                <CheckCircle size={64} strokeWidth={2} />
            </motion.div>

            {/* Burst Particles */}
            {[...Array(8)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-emerald-400 rounded-full"
                    initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                    animate={{
                        scale: [0, 1, 0],
                        opacity: [1, 0],
                        x: Math.cos(i * (Math.PI / 4)) * 40,
                        y: Math.sin(i * (Math.PI / 4)) * 40
                    }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        repeatDelay: 1
                    }}
                />
            ))}

            {/* Circle ripple */}
            <motion.div
                className="absolute border-2 border-emerald-500/30 rounded-full"
                style={{ width: 60, height: 60 }}
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
            />
        </div>
    );
};

export default FinalizingAnimation;
