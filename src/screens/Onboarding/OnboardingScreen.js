// Onboarding Screen
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { SIZES, FONTS } from '../../constants/theme';

const { width } = Dimensions.get('window');

// Icons, not emoji (Oct 2026). `icon` is the big Ionicon at the top; `items`
// are list rows drawn with an icon each, where the text used to carry emoji.
const slides = [
  {
    id: '1',
    icon: 'flash',
    title: 'Welcome to Dagitab',
    description: 'Your smart energy monitoring system for your apartment room. Monitor, control, and save energy efficiently.',
  },
  {
    id: '2',
    icon: 'power',
    title: 'Monitor Your Outlets',
    description: 'Dagitab supports 2 smart outlets. Track real-time energy usage, voltage, current, and cost per appliance.',
  },
  {
    id: '3',
    icon: 'checkmark-circle',
    title: 'Supported Appliances',
    description: 'Designed for low-voltage devices:',
    // These are the eight profiles in functions/src/lib/applianceDetector.js,
    // named exactly as the detector names them. Keep in step with
    // APPLIANCE_PROFILES - onboarding once promised one set and the
    // suggestions offered another.
    items: [
      { icon: 'cellphone-charging', label: 'Phone Charger' },
      { icon: 'lightbulb-outline', label: 'LED Lamp' },
      { icon: 'fan', label: 'Electric Fan' },
      { icon: 'laptop', label: 'Laptop Charger' },
      { icon: 'monitor', label: 'Monitor' },
      { icon: 'speaker', label: 'Speaker' },
      { icon: 'television', label: 'Television' },
      { icon: 'gamepad-variant-outline', label: 'Game Console' },
    ],
  },
  {
    id: '4',
    icon: 'close-circle',
    tone: 'danger',
    title: 'Unsupported Appliances',
    description: 'Dagitab does NOT support high-voltage appliances:',
    items: [
      { icon: 'air-conditioner', label: 'Air Conditioner' },
      { icon: 'washing-machine', label: 'Washing Machine' },
      { icon: 'tumble-dryer', label: 'Dryer' },
      { icon: 'stove', label: 'Electric Stove' },
      { icon: 'water-boiler', label: 'Water Heater' },
      { icon: 'fridge-outline', label: 'Refrigerator' },
    ],
  },
  {
    id: '5',
    icon: 'stats-chart',
    title: 'Track Your Energy',
    description: 'View daily, weekly, and monthly energy analytics. Compare usage and monitor your electricity bill in real-time.',
  },
  {
    id: '6',
    icon: 'timer',
    title: 'Smart Scheduling',
    description: 'Set timers and schedules for your appliances. Choose countdown timers or specific times and days of the week.',
  },
  {
    id: '7',
    icon: 'shield-checkmark',
    title: 'Power Safety Management',
    description: 'Dagitab protects your devices with 3 safety stages:',
    stages: [
      { color: '#F59E0B', label: 'Warning stage' },
      { color: '#F97316', label: 'Limit stage' },
      { color: '#EF4444', label: 'Cut-off stage' },
    ],
    footer: 'Prevents overload and unsafe power usage.',
  },
  {
    id: '8',
    icon: 'wallet',
    title: 'Budget Tracking',
    description: 'Set your monthly electricity budget and track your spending. Get alerts when you are approaching your limit.',
  },
  {
    id: '9',
    icon: 'receipt',
    title: 'Rates Are Automatic',
    description: "Every peso figure in Dagitab is based on PELCO III home rates.\n\nDagitab reads PELCO III's official rate every month, so there is nothing to look up or type. If your bill ever shows a different rate, you can enter your own in Settings.",
  },
];

export const OnboardingScreen = ({ onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = async () => {
    await handleFinish();
  };
  
  const handleFinish = async () => {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    onFinish(); // triggers re-check in AppNavigator
  };


  const renderSlide = ({ item }) => {
    const danger = item.tone === 'danger';
    return (
      <View style={styles.slide}>
        <View style={[styles.heroIcon, danger && styles.heroIconDanger]}>
          <Ionicons name={item.icon} size={52} color={danger ? COLORS.error : COLORS.primary} />
        </View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>

        {item.items ? (
          <View style={styles.itemGrid}>
            {item.items.map((entry) => (
              <View key={entry.label} style={styles.itemRow}>
                <MaterialCommunityIcons
                  name={entry.icon}
                  size={18}
                  color={danger ? COLORS.error : COLORS.primary}
                />
                <Text style={[styles.itemLabel, danger && styles.itemLabelDanger]}>{entry.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {item.stages ? (
          <View style={styles.stages}>
            {item.stages.map((stage) => (
              <View key={stage.label} style={styles.stageRow}>
                <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
                <Text style={styles.itemLabel}>{stage.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {item.footer ? <Text style={[styles.slideDescription, styles.footer]}>{item.footer}</Text> : null}
      </View>
    );
  };

  const renderDots = () => (
    <View style={styles.dotsContainer}>
      {slides.map((_, index) => {
        const inputRange = [
          (index - 1) * width,
          index * width,
          (index + 1) * width,
        ];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View
            key={index}
            style={[styles.dot, { width: dotWidth, opacity }]}
          />
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / slides.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {currentIndex + 1}/{slides.length}
        </Text>
      </View>

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
      />

      {/* Dots */}
      {renderDots()}

      {/* Bottom Buttons */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  skipButton: {
    alignSelf: 'flex-end',
    padding: SIZES.padding,
  },
  skipText: {
    ...FONTS.body,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding * 1.5,
    marginBottom: 8,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressText: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.padding * 2,
  },
  heroIcon: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#ECF8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  heroIconDanger: {
    backgroundColor: '#FEF2F2',
  },
  itemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    rowGap: 10,
  },
  itemRow: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  itemLabel: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  itemLabelDanger: {
    color: COLORS.textDark,
  },
  stages: {
    marginTop: 16,
    gap: 10,
    alignSelf: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  footer: {
    marginTop: 16,
  },
  slideTitle: {
    ...FONTS.h2,
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  slideDescription: {
    ...FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  bottomContainer: {
    paddingHorizontal: SIZES.padding * 1.5,
    paddingBottom: SIZES.padding,
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    height: SIZES.buttonHeight,
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonText: {
    ...FONTS.h4,
    color: COLORS.white,
    fontWeight: '600',
  },
});