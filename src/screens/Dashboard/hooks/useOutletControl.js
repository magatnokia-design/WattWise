import { useState, useCallback, useEffect } from 'react';
import { outletService } from '../../../services/firebase';
import { auth } from '../../../services/firebase/config';

export const useOutletControl = () => {
  const [outlet1Status, setOutlet1Status] = useState(false);
  const [outlet2Status, setOutlet2Status] = useState(false);
  const [outlet1Name, setOutlet1Name] = useState('Outlet 1');
  const [outlet2Name, setOutlet2Name] = useState('Outlet 2');
  const [isToggling, setIsToggling] = useState(false);

  // Load outlet data on mount
  useEffect(() => {
    const loadOutlets = async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const result = await outletService.getOutlets(userId);
      if (result.success && result.data.length > 0) {
        result.data.forEach(outlet => {
          if (outlet.outletNumber === 1) {
            setOutlet1Status(outlet.isOn);
            setOutlet1Name(outlet.applianceName);
          } else if (outlet.outletNumber === 2) {
            setOutlet2Status(outlet.isOn);
            setOutlet2Name(outlet.applianceName);
          }
        });
      }
    };

    loadOutlets();

    // Real-time listener
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const unsubscribe = outletService.subscribeToOutlets(
      userId,
      (outlets) => {
        outlets.forEach(outlet => {
          if (outlet.outletNumber === 1) {
            setOutlet1Status(outlet.isOn);
            setOutlet1Name(outlet.applianceName);
          } else if (outlet.outletNumber === 2) {
            setOutlet2Status(outlet.isOn);
            setOutlet2Name(outlet.applianceName);
          }
        });
      },
      (error) => console.error('Outlet subscription error:', error)
    );

    return () => unsubscribe();
  }, []);

  // Toggle outlet ON/OFF
  const toggleOutlet = useCallback(async (outletNumber, newStatus) => {
    setIsToggling(true);
    
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await outletService.toggleOutlet(userId, outletNumber, newStatus);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error toggling outlet:', error);
      return { success: false, error: error.message };
    } finally {
      setIsToggling(false);
    }
  }, []);

  // Update appliance name
  const updateApplianceName = useCallback(async (outletNumber, newName) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('User not authenticated');

      const result = await outletService.updateApplianceName(userId, outletNumber, newName);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating appliance name:', error);
      return { success: false, error: error.message };
    }
  }, []);

  return {
    outlet1Status,
    outlet2Status,
    outlet1Name,
    outlet2Name,
    isToggling,
    toggleOutlet,
    updateApplianceName,
  };
};