/**
 * Program Review Cards Component
 * 
 * Visual card layout for reviewing program spaces before generation
 */

import React from 'react';
import { motion } from 'framer-motion';
import { staggerCards, cardEntrance, fadeInUp } from '../../styles/animations.js';
import {
  Home, Building2, Users, Utensils, Bath, Bed,
  Briefcase, ShoppingCart, Heart, GraduationCap,
  Dumbbell, Warehouse, Library
} from 'lucide-react';

const ProgramReviewCards = ({ programSpaces = [], onEdit }) => {
  const getSpaceIcon = (spaceType) => {
    const iconMap = {
      living_room: Home,
      bedroom: Bed,
      kitchen: Utensils,
      bathroom: Bath,
      office: Briefcase,
      reception: Users,
      waiting_area: Users,
      consultation_room: Heart,
      classroom: GraduationCap,
      storage: Warehouse,
      library: Library,
      retail: ShoppingCart,
      gym: Dumbbell,
    };
    
    const Icon = iconMap[spaceType] || Building2;
    return <Icon className="w-5 h-5" />;
  };
  
  const getSpaceColor = (spaceType) => {
    const colorMap = {
      living_room: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
      bedroom: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
      kitchen: 'from-orange-500/20 to-orange-600/10 border-orange-500/30',
      bathroom: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
      office: 'from-slate-500/20 to-slate-600/10 border-slate-500/30',
      reception: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
      consultation_room: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
      classroom: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    };
    
    return colorMap[spaceType] || 'from-royal-500/20 to-royal-600/10 border-royal-500/30';
  };
  
  const totalArea = programSpaces.reduce((sum, space) => {
    return sum + (space.area || 0) * (space.count || 1);
  }, 0);
  
  const spacesByLevel = programSpaces.reduce((acc, space) => {
    const level = space.level || 'Ground';
    if (!acc[level]) acc[level] = [];
    acc[level].push(space);
    return acc;
  }, {});
  
  if (programSpaces.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-16 h-16 mx-auto text-gray-600 mb-4" />
        <p className="text-gray-400">No program spaces defined yet</p>
        <p className="text-sm text-gray-500 mt-2">Generate or add spaces to see the review</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <motion.div
        className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-royal-600/20 to-royal-500/10 border border-royal-500/30"
        variants={fadeInUp}
        initial="initial"
        animate="animate"
      >
        <div>
          <h4 className="text-lg font-semibold text-white">Program Summary</h4>
          <p className="text-sm text-gray-300 mt-1">
            {programSpaces.length} spaces across {Object.keys(spacesByLevel).length} levels
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-white">{totalArea.toFixed(0)}</div>
          <div className="text-sm text-gray-400">Total m²</div>
        </div>
      </motion.div>
      
      {/* Spaces by Level */}
      {Object.entries(spacesByLevel).map(([level, spaces]) => (
        <div key={level} className="space-y-3">
          <h5 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            {level} Floor
          </h5>
          
          <motion.div
            className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
            variants={staggerCards}
            initial="initial"
            animate="animate"
          >
            {spaces.map((space, index) => (
              <motion.div
                key={space.id || index}
                className={`relative p-4 rounded-xl bg-gradient-to-br border backdrop-blur-sm ${getSpaceColor(space.spaceType)} hover:scale-[1.02] transition-transform cursor-pointer`}
                variants={cardEntrance}
                onClick={() => onEdit && onEdit(space)}
                whileHover={{ y: -2 }}
              >
                {/* Icon */}
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-navy-800/50">
                    {getSpaceIcon(space.spaceType)}
                  </div>
                  {space.count > 1 && (
                    <span className="text-xs px-2 py-1 rounded-full bg-navy-800/70 text-gray-300">
                      ×{space.count}
                    </span>
                  )}
                </div>
                
                {/* Space name */}
                <h6 className="font-semibold text-white mb-1">
                  {space.label || space.name}
                </h6>
                
                {/* Area */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-white">
                    {(space.area || 0).toFixed(0)}
                  </span>
                  <span className="text-sm text-gray-400">m²</span>
                  {space.count > 1 && (
                    <span className="text-xs text-gray-500">
                      ({((space.area || 0) * space.count).toFixed(0)}m² total)
                    </span>
                  )}
                </div>
                
                {/* Notes */}
                {space.notes && (
                  <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                    {space.notes}
                  </p>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      ))}
    </div>
  );
};

export default ProgramReviewCards;

