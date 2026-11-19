import React from 'react';
import { createPortal } from 'react-dom';

/** Keep overlays outside scrolling containers and local stacking contexts. */
const BodyPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  createPortal(children, document.body)
);

export default BodyPortal;
