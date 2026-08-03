/**
 * Saga Pattern Implementation for Order Workflows
 * Manages distributed transactions with compensation logic
 */
class SagaManager {
  constructor() {
    this.executions = new Map();
  }

  /**
   * Execute a saga with compensation steps
   */
  async execute(sagaDefinition, context) {
    const executionId = `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const execution = {
      id: executionId,
      sagaName: sagaDefinition.name,
      status: 'pending',
      startedAt: new Date(),
      completedSteps: [],
      failedSteps: [],
      error: null
    };

    this.executions.set(executionId, execution);
    console.log(`Starting saga: ${sagaDefinition.name} (ID: ${executionId})`);

    let currentContext = context;

    for (let i = 0; i < sagaDefinition.steps.length; i++) {
      const step = sagaDefinition.steps[i];
      execution.currentStep = i;

      console.log(`Executing step ${i + 1}/${sagaDefinition.steps.length}: ${step.name}`);

      try {
        const result = await step.execute(currentContext);
        currentContext = result;
        execution.completedSteps.push(step.name);
        console.log(`Step completed: ${step.name}`);
      } catch (error) {
        console.error(`Step failed: ${step.name} - ${error.message}`);
        execution.status = 'compensating';
        execution.failedSteps.push(step.name);
        execution.error = error.message;

        // Compensate all completed steps in reverse order
        await this.compensateSteps(sagaDefinition.steps, currentContext, i);

        execution.status = 'failed';
        execution.completedAt = new Date();
        throw error;
      }
    }

    execution.status = 'completed';
    execution.completedAt = new Date();
    console.log(`Saga completed successfully: ${sagaDefinition.name}`);

    // Clean up old executions
    if (this.executions.size > 100) {
      const firstKey = this.executions.keys().next().value;
      this.executions.delete(firstKey);
    }

    return currentContext;
  }

  /**
   * Get execution status
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  async compensateSteps(steps, context, failedStepIndex) {
    console.log('Starting compensation...');

    for (let i = failedStepIndex - 1; i >= 0; i--) {
      const step = steps[i];
      if (step.compensate && execution.completedSteps.includes(step.name)) {
        console.log(`Compensating step: ${step.name}`);
        try {
          await step.compensate(context);
          console.log(`Compensation completed: ${step.name}`);
        } catch (error) {
          console.error(`Compensation failed for step: ${step.name} - ${error.message}`);
          // Continue with other compensations even if one fails
        }
      }
    }
  }
}

module.exports = SagaManager;
