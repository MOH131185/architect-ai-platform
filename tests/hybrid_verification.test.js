
import dnaWorkflowOrchestrator from '../src/services/dnaWorkflowOrchestrator';
import { setFeatureFlag, isFeatureEnabled } from '../src/config/featureFlags';

describe('Multi-Panel A1 Workflow Verification', () => {
  let originalHybridFlag;
  let originalMultiPanelFlag;

  beforeAll(() => {
    originalHybridFlag = isFeatureEnabled('hybridA1Mode');
    originalMultiPanelFlag = isFeatureEnabled('multiPanelA1');
  });

  afterAll(() => {
    setFeatureFlag('hybridA1Mode', originalHybridFlag);
    setFeatureFlag('multiPanelA1', originalMultiPanelFlag);
  });

  test('should call Multi-Panel workflow when flag is enabled', async () => {
    setFeatureFlag('multiPanelA1', true);
    expect(isFeatureEnabled('multiPanelA1')).toBe(true);

    const multiSpy = jest.spyOn(dnaWorkflowOrchestrator, 'runMultiPanelA1Workflow')
      .mockResolvedValue({ success: true, workflow: 'multi-panel-mock' });

    const result = await dnaWorkflowOrchestrator.runMultiPanelA1Workflow({
      projectContext: { buildingProgram: 'house' },
      locationData: {}
    });

    expect(multiSpy).toHaveBeenCalled();
    expect(result.workflow).toBe('multi-panel-mock');

    multiSpy.mockRestore();
  });

  test('hybrid flag should not bypass multi-panel default', async () => {
    setFeatureFlag('hybridA1Mode', true);
    setFeatureFlag('multiPanelA1', true);

    const hybridSpy = jest.spyOn(dnaWorkflowOrchestrator, 'runHybridA1Workflow')
      .mockResolvedValue({ success: true, workflow: 'hybrid-mock' });

    const multiSpy = jest.spyOn(dnaWorkflowOrchestrator, 'runMultiPanelA1Workflow')
      .mockResolvedValue({ success: true, workflow: 'multi-panel-mock' });

    const result = await dnaWorkflowOrchestrator.runMultiPanelA1Workflow({
      projectContext: { buildingProgram: 'house' },
      locationData: {}
    });

    expect(hybridSpy).not.toHaveBeenCalled();
    expect(multiSpy).toHaveBeenCalled();
    expect(result.workflow).toBe('multi-panel-mock');

    hybridSpy.mockRestore();
    multiSpy.mockRestore();
  });
});
