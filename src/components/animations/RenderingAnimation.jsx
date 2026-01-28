
import React from 'react';
import { motion } from 'framer-motion';
import { Home } from 'lucide-react';

const RenderingAnimation = ({ className = "w-full h-32" }) => {
    return (
        <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            {/* Wireframe Layer */}
            <div className="absolute inset-0 flex items-center justify-center text-gray-700">
                <Home size={64} strokeWidth={1} />
            </div>

            {/* Rendered Layer (masked) */}
            <motion.div
                className="absolute inset-0 flex items-center justify-center text-cyan-400 overflow-hidden"
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 0)'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.5 }}
            >
                <Home size={64} strokeWidth={2} fill="currentColor" fillOpacity={0.2} />
            </motion.div>

            {/* Scanning Bar */}
            <motion.div
                className="absolute h-full w-1 bg-white/50 blur-sm top-0"
                initial={{ left: '0%' }}
                animate={{ left: ['0%', '100%', '100%'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.5 }}
            />
        </div>
    );
};

export default RenderingAnimation;
