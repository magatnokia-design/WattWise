export const calculateComparison = (current, previous) => {
  const calculateChange = (currentValue, previousValue) => {
    if (previousValue === 0) {
      return {
        difference: currentValue,
        percentage: currentValue > 0 ? 100 : 0,
        type: currentValue > 0 ? 'increase' : 'same',
      };
    }

    const difference = currentValue - previousValue;
    const percentage = (Math.abs(difference) / previousValue) * 100;

    return {
      difference,
      percentage,
      type: difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'same',
    };
  };

  return {
    kWhChange: calculateChange(current.kWh, previous.kWh),
    costChange: calculateChange(current.cost, previous.cost),
    outlet1Change: calculateChange(current.outlet1, previous.outlet1),
    outlet2Change: calculateChange(current.outlet2, previous.outlet2),
  };
};

export const generateInsights = (comparison, current, previous) => {
  const insights = [];

  // Overall usage insight
  if (comparison.kWhChange.type === 'increase') {
    insights.push({
      type: 'warning',
      message: `Energy usage increased by ${comparison.kWhChange.percentage.toFixed(1)}% compared to last month`,
      tip: 'Consider identifying high-consumption appliances and reducing usage',
    });
  } else if (comparison.kWhChange.type === 'decrease') {
    insights.push({
      type: 'success',
      message: `Great job! Energy usage decreased by ${comparison.kWhChange.percentage.toFixed(1)}% compared to last month`,
      tip: 'Keep up the good energy-saving habits',
    });
  } else {
    insights.push({
      type: 'info',
      message: 'Energy usage is consistent with last month',
    });
  }

  // Cost insight
  if (comparison.costChange.type === 'increase' && comparison.costChange.percentage > 10) {
    insights.push({
      type: 'warning',
      message: `Electricity cost increased by ₱${comparison.costChange.difference.toFixed(2)} (${comparison.costChange.percentage.toFixed(1)}%)`,
      tip: 'Review your usage patterns to identify cost-saving opportunities',
    });
  }

  // Outlet comparison insight
  const outlet1Higher = current.outlet1 > current.outlet2;
  const higherOutlet = outlet1Higher ? 'Outlet 1' : 'Outlet 2';
  const higherValue = outlet1Higher ? current.outlet1 : current.outlet2;
  const lowerValue = outlet1Higher ? current.outlet2 : current.outlet1;
  
  if (higherValue > 0 && lowerValue > 0) {
    const diff = ((higherValue - lowerValue) / lowerValue) * 100;
    if (diff > 20) {
      insights.push({
        type: 'info',
        message: `${higherOutlet} consumes ${diff.toFixed(0)}% more energy than the other outlet`,
        tip: 'Consider balancing appliance usage across outlets',
      });
    }
  }

  // No data insight
  if (current.kWh === 0 && previous.kWh === 0) {
    return [{
      type: 'info',
      message: 'No usage data available for comparison',
      tip: 'Add previous month bill data to see insights',
    }];
  }

  return insights;
};

export const formatMonthYear = (monthString) => {
  const date = new Date(monthString + '-01');
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const getPreviousMonth = (monthString) => {
  const date = new Date(monthString + '-01');
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
};