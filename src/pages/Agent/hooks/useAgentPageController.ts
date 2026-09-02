// @ts-nocheck
import { useAgentCoreLogic } from './useAgentCoreLogic';
import { useAgentCameraVnc } from './useAgentCameraVnc';
import { useAgentScanActions } from './useAgentScanActions';
import { useAgentDriverInstall } from './useAgentDriverInstall';

export function useAgentPageController() {
  const core = useAgentCoreLogic({});
  const media = useAgentCameraVnc(core);
  const scanActions = useAgentScanActions({ ...core, ...media });
  const driverActions = useAgentDriverInstall({ showToast: core.showToast, replaceToast: core.replaceToast });
  
  const propsToPass = { ...core, ...media, ...scanActions, ...driverActions };
  return propsToPass;
}
