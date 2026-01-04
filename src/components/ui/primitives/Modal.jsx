import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Modal content size variants
const modalVariants = cva(
  // Base styles
  'relative bg-white rounded-2xl shadow-2xl w-full max-h-[85vh] overflow-hidden flex flex-col',
  {
    variants: {
      size: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        full: 'max-w-[calc(100vw-2rem)]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

// Animation variants
const overlayAnimation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const contentAnimation = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

/**
 * Modal component using Radix Dialog with Framer Motion animations
 */
const Modal = ({
  open,
  onOpenChange,
  children,
  size = 'md',
  className,
  showClose = true,
  closeOnOverlayClick = true,
  ...props
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} {...props}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-modal-backdrop bg-black/50 backdrop-blur-sm"
                {...overlayAnimation}
                transition={{ duration: 0.2 }}
                onClick={closeOnOverlayClick ? () => onOpenChange(false) : undefined}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className={cn(
                  'fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2',
                  modalVariants({ size }),
                  className
                )}
                {...contentAnimation}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                onClick={(e) => e.stopPropagation()}
              >
                {showClose && (
                  <Dialog.Close asChild>
                    <button
                      className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      aria-label="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                )}
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

/**
 * Modal Header
 */
const ModalHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6 pb-4', className)}
    {...props}
  />
));

ModalHeader.displayName = 'ModalHeader';

/**
 * Modal Title
 */
const ModalTitle = React.forwardRef(({ className, ...props }, ref) => (
  <Dialog.Title asChild>
    <h2
      ref={ref}
      className={cn(
        'text-lg font-semibold leading-none tracking-tight text-gray-900',
        className
      )}
      {...props}
    />
  </Dialog.Title>
));

ModalTitle.displayName = 'ModalTitle';

/**
 * Modal Description
 */
const ModalDescription = React.forwardRef(({ className, ...props }, ref) => (
  <Dialog.Description asChild>
    <p
      ref={ref}
      className={cn('text-sm text-gray-500', className)}
      {...props}
    />
  </Dialog.Description>
));

ModalDescription.displayName = 'ModalDescription';

/**
 * Modal Body (scrollable content area)
 */
const ModalBody = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 overflow-y-auto px-6 py-2', className)}
    {...props}
  />
));

ModalBody.displayName = 'ModalBody';

/**
 * Modal Footer
 */
const ModalFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-4 border-t border-gray-100',
      className
    )}
    {...props}
  />
));

ModalFooter.displayName = 'ModalFooter';

/**
 * Modal Trigger (if needed for declarative usage)
 */
const ModalTrigger = Dialog.Trigger;

export {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalTrigger,
  modalVariants,
};

export default Modal;
