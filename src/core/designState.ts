/**
 * Design State Manager
 * 
 * Single source of truth for design project state
 * Provides CRUD operations with validation
 * Observable pattern for reactive updates
 */

import { DesignProject, DesignDNA, GeometryModel, ValidationResult } from './designSchema.js';

type StateChangeListener = (state: DesignProject) => void;

class DesignState {
  private currentProject: DesignProject | null = null;
  private listeners: Set<StateChangeListener> = new Set();
  private history: DesignProject[] = [];
  private maxHistorySize = 10;

  /**
   * Initialize new design project
   */
  initializeProject(params: {
    name: string;
    site: any;
    program: any;
    brief?: string;
  }): DesignProject {
    const project: DesignProject = {
      id: `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: params.name,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      site: params.site,
      program: params.program,
      brief: params.brief,
      dna: {} as DesignDNA, // Will be populated
      seed: Math.floor(Math.random() * 1000000)
    };

    this.currentProject = project;
    this.notifyListeners();
    
    console.log(`✅ Design project initialized: ${project.id}`);
    return project;
  }

  /**
   * Get current project
   */
  getCurrentProject(): DesignProject | null {
    return this.currentProject;
  }

  /**
   * Update DNA
   */
  updateDNA(dna: DesignDNA): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.saveToHistory();
    this.currentProject.dna = dna;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
    
    console.log(`✅ DNA updated for project ${this.currentProject.id}`);
  }

  /**
   * Update geometry
   */
  updateGeometry(geometry: GeometryModel): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.saveToHistory();
    this.currentProject.geometry = geometry;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
    
    console.log(`✅ Geometry updated for project ${this.currentProject.id}`);
  }

  /**
   * Update metrics
   */
  updateMetrics(metrics: any): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.currentProject.metrics = metrics;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Update cost
   */
  updateCost(cost: any): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.currentProject.cost = cost;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Update views
   */
  updateViews(views: Record<string, any>): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.currentProject.views = views;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Update A1 sheet
   */
  updateA1Sheet(a1Sheet: any): void {
    if (!this.currentProject) {
      throw new Error('No active project');
    }

    this.currentProject.a1Sheet = a1Sheet;
    this.currentProject.updatedAt = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Save current state to history
   */
  private saveToHistory(): void {
    if (!this.currentProject) return;

    this.history.push(JSON.parse(JSON.stringify(this.currentProject)));

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Undo last change
   */
  undo(): boolean {
    if (this.history.length === 0) {
      console.warn('No history to undo');
      return false;
    }

    this.currentProject = this.history.pop() || null;
    this.notifyListeners();
    
    console.log('↶ Undid last change');
    return true;
  }

  /**
   * Get history
   */
  getHistory(): DesignProject[] {
    return [...this.history];
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    if (!this.currentProject) return;

    this.listeners.forEach(listener => {
      try {
        listener(this.currentProject!);
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  /**
   * Reset state
   */
  reset(): void {
    this.currentProject = null;
    this.history = [];
    this.notifyListeners();
    
    console.log('🔄 Design state reset');
  }

  /**
   * Export project as JSON
   */
  exportJSON(): string {
    if (!this.currentProject) {
      throw new Error('No active project to export');
    }

    return JSON.stringify(this.currentProject, null, 2);
  }

  /**
   * Import project from JSON
   */
  importJSON(json: string): DesignProject {
    const project = JSON.parse(json);
    this.currentProject = project;
    this.notifyListeners();
    
    console.log(`✅ Project imported: ${project.id}`);
    return project;
  }
}

// Singleton instance
const designState = new DesignState();

export default designState;
export { designState, DesignState };

