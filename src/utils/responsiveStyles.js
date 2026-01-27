
/**
 * Responsive styles utility
 * 
 * NOTE: This function accepts dimensions as parameters.
 * In React components, use with useWindowDimensions() hook:
 * 
 * const { width, height } = useWindowDimensions();
 * const styles = responsiveStyles(width, height);
 * 
 * @param {number} screenWidth - Screen width
 * @param {number} screenHeight - Screen height
 * @returns {Object} Responsive styles object
 */
export const responsiveStyles = (screenWidth, screenHeight) => {
  return {
    // Title styles
    screenTitle: {
      fontSize: Math.min(screenWidth * 0.08, 32), // 8% of screen width, max 32
      fontWeight: '600',
      color: '#ffffff',
      textAlign: 'left',
      marginBottom: Math.max(16, screenHeight * 0.02), // 2% of screen height, min 16
      marginLeft: screenWidth * 0.05, // 5% of screen width
    },
    
    titleSection: {
      marginBottom: Math.max(24, screenHeight * 0.03), // 3% of screen height, min 24
    },
    
    // Card spacing
    cardSpacing: {
      marginBottom: Math.max(16, screenHeight * 0.02), // 2% of screen height, min 16
    },
    
    // Content padding
    contentPadding: {
      paddingHorizontal: screenWidth * 0.06, // 6% of screen width
      paddingTop: Math.max(20, screenHeight * 0.025), // 2.5% of screen height, min 20
      paddingBottom: 24,
    },
    
    // Button dimensions
    buttonHeight: Math.max(48, screenHeight * 0.06), // 6% of screen height, min 48
    buttonPadding: screenWidth * 0.04, // 4% of screen width
    
    // Input dimensions
    inputHeight: Math.max(44, screenHeight * 0.055), // 5.5% of screen height, min 44
    inputPadding: screenWidth * 0.04, // 4% of screen width
    
    // Icon sizes
    iconSize: Math.min(screenWidth * 0.06, 24), // 6% of screen width, max 24
    largeIconSize: Math.min(screenWidth * 0.08, 32), // 8% of screen width, max 32
  };
};

export default responsiveStyles;
