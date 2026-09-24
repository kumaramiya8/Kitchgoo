import { useApp } from './AppContext';
import { isModuleEnabled } from '../../shared/seeds';

/**
 * Returns helper functions and module status for the current tenant.
 */
export function useModules() {
  const { settings } = useApp();
  
  const isEnabled = (moduleKey) => isModuleEnabled(settings, moduleKey);

  return {
    isEnabled,
    modules: settings?.modules || {},
  };
}

export default useModules;
