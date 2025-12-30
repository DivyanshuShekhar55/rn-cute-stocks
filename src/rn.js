import { Text, View, StyleSheet } from "react-native";
import {
  Canvas,
  LinearGradient,
  Path,
  vec,
  Skia,
  Circle,
} from "@shopify/react-native-skia";
import { GenerateStringPath, GetYForX } from "./math";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useDerivedValue,
  useSharedValue,
  runOnJS,
  withTiming,
} from "react-native-reanimated";
import { useState } from "react";

export const StockCharts = ({
  width,
  height,
  chartData,
  priceTextStyles,
  curveType = "curveBasis",
  colors = ["#fff"],
  cursorComponent,
  curveStrokeWidth = 2,
  curveFill = "stroke",
  ySearch = "binarySearchWithInterpolation",
}) => {
  const { str_path, x_func, y_func, data, x_range_min, x_range_max } =
    GenerateStringPath(curveType, chartData, width, height);

  const skpath = Skia.Path.MakeFromSVGString(str_path);

  let init_x = x_func(data[0].timestamp);
  let init_y = y_func(data[0].price);

  const xPos = useSharedValue(init_x);
  const yPos = useSharedValue(init_y);
  const price_animated_val = useSharedValue(data[0].price);

  // not using toFixed() in next line would treat the init pricxe as number
  // casuing "all text must be rendered within <Text> component error"
  // this is cause it returns a number, toFixed() returns a string
  const [priceText, setPriceText] = useState(data[0].price.toFixed(2));

  useDerivedValue(() => {
    const txt = price_animated_val.value.toFixed(2);
    runOnJS(setPriceText)(txt);
  }, [price_animated_val]);

  const updateY = (clamped_x) => {
    let res_prices = GetYForX(clamped_x, width, data, height, ySearch);
    yPos.value = res_prices.y_coord;

    price_animated_val.value = withTiming(res_prices.real_price, {
      duration: 100,
    });
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    "worklet";
    const raw_x = Number(evt.x);
    const clamped = Math.max(x_range_min, Math.min(x_range_max, raw_x));
    xPos.value = clamped;

    runOnJS(updateY)(clamped);
  });

  if (!chartData || chartData.length === 0) {
    return null; // or a fallback view in future , maybe :)
  }

  return (
    <View style={styles.home__main}>
      <Text style={[styles.home__price, priceTextStyles]}>${priceText}</Text>

      <GestureDetector gesture={pan}>
        <Canvas
          style={{
            width: width,
            height: height,
          }}
        >
          {cursorComponent ? (
            cursorComponent({ xPos, yPos })
          ) : (
            <Cursor xPos={xPos} yPos={yPos} />
          )}

          {skpath && (
            <Path
              path={skpath}
              style={curveFill}
              strokeWidth={curveStrokeWidth}
              color={"#fff"} // i forgot what's this :(
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(width, height)}
                colors={colors}
              />
            </Path>
          )}
        </Canvas>
      </GestureDetector>
    </View>
  );
};

const Cursor = ({ xPos, yPos }) => {
  return (
    <>
      <Circle style="fill" color="#f69d69" cx={xPos} cy={yPos} r={5} />
      <Circle
        style="stroke"
        color="#f69d69"
        cx={xPos}
        cy={yPos}
        r={12}
        strokeWidth={2}
        opacity={0.65}
      />
      <Circle
        style="stroke"
        color="#f69d69"
        cx={xPos}
        cy={yPos}
        r={18}
        strokeWidth={2}
        opacity={0.65}
      />
    </>
  );
};

const styles = StyleSheet.create({
  home__main: {
    flex: 1,
    paddingVertical: 50,
    alignItems: "center",
    backgroundColor: "#181818",
    paddingHorizontal: 20,
  },
  home__price: {
    color: "#000",
    fontSize: 52,
  },
});
