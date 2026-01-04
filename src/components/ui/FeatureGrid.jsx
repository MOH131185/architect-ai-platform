import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { staggerChildren, cardReveal } from '../../styles/animations.js';

const FeatureGrid = ({
  features,
  columns = 3,
  gap = 'lg',
  className = '',
  ...props
}) => {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };
  
  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
    xl: 'gap-12',
  };
  
  return (
    <motion.div
      className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}
      variants={staggerChildren}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: "-100px" }}
      {...props}
    >
      {features.map((feature, index) => (
        <FeatureCard key={index} {...feature} />
      ))}
    </motion.div>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
  link,
  className = '',
}) => {
  const content = (
    <motion.div
      className={`p-8 rounded-2xl bg-navy-800 border border-navy-700 hover:border-royal-600 transition-all duration-300 group ${className}`}
      variants={cardReveal}
      whileHover={{
        y: -8,
        boxShadow: '0 0 30px rgba(37, 99, 235, 0.3)',
      }}
    >
      {icon && (
        <div className="mb-6 text-royal-400 group-hover:text-royal-300 transition-colors duration-300">
          <div className="w-14 h-14 rounded-xl bg-royal-600/10 flex items-center justify-center group-hover:bg-royal-600/20 transition-colors duration-300">
            {icon}
          </div>
        </div>
      )}
      
      <h3 className="text-2xl font-bold text-white mb-3 font-heading group-hover:text-gradient transition-all duration-300">
        {title}
      </h3>
      
      <p className="text-gray-400 leading-relaxed">
        {description}
      </p>
      
      {link && (
        <div className="mt-6 text-royal-400 group-hover:text-royal-300 font-medium flex items-center gap-2">
          {link.text}
          <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
      
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-royal-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </motion.div>
  );
  
  if (link && link.href) {
    return (
      <a href={link.href} className="block">
        {content}
      </a>
    );
  }
  
  return content;
};

FeatureGrid.propTypes = {
  features: PropTypes.arrayOf(
    PropTypes.shape({
      icon: PropTypes.node,
      title: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      link: PropTypes.shape({
        text: PropTypes.string,
        href: PropTypes.string,
      }),
      className: PropTypes.string,
    })
  ).isRequired,
  columns: PropTypes.oneOf([1, 2, 3, 4]),
  gap: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  className: PropTypes.string,
};

export default FeatureGrid;

