/**
 * Deferred loading utilities to reduce network dependency chains
 * Implements progressive enhancement and lazy data fetching
 */

type LoadPriority = 'critical' | 'high' | 'normal' | 'low';

interface DeferredTask {
  fn: () => void | Promise<void>;
  priority: LoadPriority;
  condition?: () => boolean;
}

class DeferredLoader {
  private tasks: Map<LoadPriority, DeferredTask[]> = new Map([
    ['critical', []],
    ['high', []],
    ['normal', []],
    ['low', []]
  ]);

  private isInitialized = false;

  /**
   * Add a task to be executed based on priority
   */
  add(task: DeferredTask) {
    const priorityTasks = this.tasks.get(task.priority) || [];
    priorityTasks.push(task);
    this.tasks.set(task.priority, priorityTasks);

    if (this.isInitialized) {
      this.processPriority(task.priority);
    }
  }

  /**
   * Initialize and start processing tasks
   */
  async initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Wait for page to be interactive
    await this.waitForInteractive();

    // Process tasks in priority order
    await this.processPriority('critical');
    
    // Use requestIdleCallback for lower priority tasks
    this.scheduleIdleTasks('high');
    this.scheduleIdleTasks('normal');
    this.scheduleIdleTasks('low');
  }

  private async waitForInteractive(): Promise<void> {
    return new Promise(resolve => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        resolve();
      } else {
        window.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      }
    });
  }

  private async processPriority(priority: LoadPriority) {
    const tasks = this.tasks.get(priority) || [];
    
    for (const task of tasks) {
      // Check if task should run
      if (task.condition && !task.condition()) {
        continue;
      }

      try {
        await task.fn();
      } catch (error) {
        console.warn(`Deferred task failed (${priority}):`, error);
      }
    }

    // Clear processed tasks
    this.tasks.set(priority, []);
  }

  private scheduleIdleTasks(priority: LoadPriority) {
    const tasks = this.tasks.get(priority) || [];
    
    if (tasks.length === 0) return;

    const processTask = (index: number) => {
      if (index >= tasks.length) {
        this.tasks.set(priority, []);
        return;
      }

      const task = tasks[index];
      
      // Check condition
      if (task.condition && !task.condition()) {
        processTask(index + 1);
        return;
      }

      const scheduleNext = () => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => processTask(index + 1), { timeout: 2000 });
        } else {
          setTimeout(() => processTask(index + 1), 0);
        }
      };

      try {
        const result = task.fn();
        if (result instanceof Promise) {
          result.then(scheduleNext).catch(error => {
            console.warn(`Idle task failed (${priority}):`, error);
            scheduleNext();
          });
        } else {
          scheduleNext();
        }
      } catch (error) {
        console.warn(`Idle task failed (${priority}):`, error);
        scheduleNext();
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => processTask(0), { timeout: 1000 });
    } else {
      setTimeout(() => processTask(0), 100);
    }
  }

  /**
   * Defer data fetching based on visibility
   */
  deferUntilVisible(element: HTMLElement | null, callback: () => void, priority: LoadPriority = 'normal') {
    if (!element) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.add({ fn: callback, priority });
            observer.disconnect();
          }
        });
      }, {
        rootMargin: '50px' // Start loading 50px before element is visible
      });

      observer.observe(element);
    } else {
      // Fallback: load after delay
      this.add({ fn: callback, priority });
    }
  }

  /**
   * Defer data fetching until user interaction
   */
  deferUntilInteraction(callback: () => void, priority: LoadPriority = 'low') {
    const events = ['mousedown', 'touchstart', 'keydown', 'scroll'];
    
    const handler = () => {
      this.add({ fn: callback, priority });
      events.forEach(event => {
        document.removeEventListener(event, handler);
      });
    };

    events.forEach(event => {
      document.addEventListener(event, handler, { once: true, passive: true });
    });

    // Fallback: load after 5 seconds if no interaction
    setTimeout(() => {
      this.add({ fn: callback, priority });
    }, 5000);
  }
}

// Global instance
export const deferredLoader = new DeferredLoader();

// Auto-initialize
if (typeof window !== 'undefined') {
  deferredLoader.initialize();
}
