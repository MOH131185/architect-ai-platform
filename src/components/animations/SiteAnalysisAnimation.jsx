
import React from 'react';
import { motion } from 'framer-motion';
import { Map, Scan } from 'lucide-react';

const SiteAnalysisAnimation = ({ className = "w-full h-32" }) => {
    return (
        <div className={`relative flex items-center justify-center overflow-hidden ${className}`}>
            {/* Radar Background */}
            <div className="absolute inset-0 flex items-center justify-center">
                {[1, 2, 3].map((i) => (
                    <motion.div
                        key={i}
                        className="absolute border border-royal-500/30 rounded-full"
                        style={{ width: `${i * 30}%`, height: `${i * 30}%` }}
                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.1, 0.3] }}
                        transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
                    />
                ))}
            </div>

            {/* Map Icon */}
            <div className="relative z-10 text-royal-400">
                <Map size={48} strokeWidth={1} />
            </div>

            {/* Scanning Line */}
            <motion.div
                className="absolute w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50 z-20"
                style={{ top: '50%' }}
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity }}
            />

            {/* Scanning Cone (Radar sweep effect) */}
            <motion.div
                className="absolute w-1/2 h-1/2 origin-bottom-right bg-gradient-to-t from-royal-500/20 to-transparent"
                style={{ top: '0', left: '0' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity }}
            />
        </div>
    );
};

export default SiteAnalysisAnimation;
