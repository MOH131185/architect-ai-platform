
import React from 'react';
import { motion } from 'framer-motion';
import { LayoutTemplate } from 'lucide-react';

const LayoutAnimation = ({ className = "w-full h-32" }) => {
    const blocks = [
        { x: -40, y: -20, w: 30, h: 40, color: 'bg-royal-500' },
        { x: 0, y: -20, w: 40, h: 20, color: 'bg-cyan-500' },
        { x: 0, y: 10, w: 40, h: 10, color: 'bg-indigo-500' },
        { x: 50, y: -20, w: 20, h: 40, color: 'bg-blue-400' },
    ];

    return (
        <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            <div className="relative w-full h-full flex items-center justify-center">
                {blocks.map((block, i) => (
                    <motion.div
                        key={i}
                        className={`absolute rounded ${block.color} opacity-80 backdrop-blur-sm`}
                        style={{ width: block.w, height: block.h }}
                        initial={{ x: block.x * 2, y: block.y * 2, opacity: 0 }}
                        animate={{
                            x: [block.x * 2, block.x, block.x],
                            y: [block.y * 2, block.y, block.y],
                            opacity: [0, 1, 1]
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatDelay: 1,
                            ease: "circOut",
                            delay: i * 0.2
                        }}
                    />
                ))}

                <motion.div
                    className="absolute text-white/10"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    <LayoutTemplate size={80} strokeWidth={0.5} />
                </motion.div>
            </div>
        </div>
    );
};

export default LayoutAnimation;
