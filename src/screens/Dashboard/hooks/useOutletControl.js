import { useState, useCallback } from 'react';

export const useOutletControl = () => {
  const [outlet1Status, setOutlet1Status] = useState(false); // false = OFF, true = ON
  const [outlet2Status, setOutlet2Status] = useState(false);
  const [outlet1Name, setOutlet1Name] = useState('Outlet 1');
  const [outlet2Name, setOutlet2Name] = useState('Outlet 2');
  const [isToggling, setIsToggling] = useState(false);

  // Toggle outlet ON/OFF
  const toggleOutlet = useCallback(async (outletNumber, newStatus) => {
    setIsToggling(true);
    
    try {
      // TODO: Send command to Firebase/ESP32
      // await firestoreService.updateOutletStatus(outletNumber, newStatus);
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (outletNumber === 1) {
        setOutlet1Status(newStatus);
      } else {
        setOutlet2Status(newStatus);
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
      // TODO: Save to Firebase
      // await firestoreService.updateApplianceName(outletNumber, newName);
      
      if (outletNumber === 1) {
        setOutlet1Name(newName);
      } else {
        setOutlet2Name(newName);
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