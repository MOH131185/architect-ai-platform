/**
 * Validation utility functions for form inputs
 */

export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateAddress = (address) => {
  if (!address || address.trim().length < 5) {
    return {
      isValid: false,
      error: 'Please enter a valid address (at least 5 characters)'
    };
  }
  return { isValid: true };
};

export const validateProjectArea = (area) => {
  const numArea = parseFloat(area);
  if (isNaN(numArea) || numArea <= 0) {
    return {
      isValid: false,
      error: 'Please enter a valid area greater than 0'
    };
  }
  if (numArea > 100000) {
    return {
      isValid: false,
      error: 'Area cannot exceed 100,000 m²'
    };
  }
  if (numArea < 50) {
    return {
      isValid: false,
      error: 'Minimum area is 50 m²'
    };
  }
  return { isValid: true };
};

export const validateBuildingProgram = (program) => {
  if (!program || program.trim().length < 3) {
    return {
      isValid: false,
      error: 'Please select or enter a building program'
    };
  }
  return { isValid: true };
};

export const validateEntranceDirection = (direction) => {
  const validDirections = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];
  if (!direction || !validDirections.includes(direction.toUpperCase())) {
    return {
      isValid: false,
      error: 'Please select a valid entrance direction'
    };
  }
  return { isValid: true };
};

export const validatePortfolioFile = (file) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!file) {
    return {
      isValid: false,
      error: 'Please select a file'
    };
  }

  if (!validTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Please upload a valid image file (JPEG, PNG, or WebP)'
    };
  }

  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File size must be less than 10MB'
    };
  }

  return { isValid: true };
};

export const validateProjectDetails = (details) => {
  const errors = {};

  const areaValidation = validateProjectArea(details.area);
  if (!areaValidation.isValid) {
    errors.area = areaValidation.error;
  }

  const programValidation = validateBuildingProgram(details.program);
  if (!programValidation.isValid) {
    errors.program = programValidation.error;
  }

  const directionValidation = validateEntranceDirection(details.entranceDirection);
  if (!directionValidation.isValid) {
    errors.entranceDirection = directionValidation.error;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const sanitizeInput = (input) => {
  // Remove potentially harmful characters
  return input.replace(/[<>]/g, '').trim();
};

export const formatArea = (area) => {
  const num = parseFloat(area);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('en-US').format(num);
};