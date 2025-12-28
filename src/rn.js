import { Text, View, StyleSheet } from "react-native";
import { Canvas, LinearGradient, Path, vec, Skia } from "@shopify/react-native-skia"
import { GenerateStringPath, GetYForX } from "../data/math-stuff"
import PeriodBar from "../components/PeriodBar"
import Cursor from "../components/Cursor"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { useDerivedValue, useSharedValue, runOnJS, withTiming } from "react-native-reanimated";
import { useState } from "react";
import StockHeader from "../components/StockHeader";
import StockInfo from "../components/StockInfo";

export const StockCharts = ({
  width,
  height,
  chartData,
  curveType = "curveBasis",
  colors = ["#fff"],
  ySearch,
}) => {
  const { str_path, x_func, y_func, data, x_range_min, x_range_max } =
    GenerateStringPath(curveType, chartData, width, height);

  const skpath = Skia.Path.MakeFromSVGString(str_path);

  let init_x = x_func(data[0].timestamp);
  let init_y = y_func(data[0].price);

  const x_pos = useSharedValue(init_x);
  const y_pos = useSharedValue(init_y);
  const price_animated_val = useSharedValue(data[0].price);
  const [priceText, setPriceText] = useState(data[0].price);

  useDerivedValue(() => {
    const txt = price_animated_val.value.toFixed(2);
    runOnJS(setPriceText)(txt);
  }, [price_animated_val]);

  const updateY = (clamped_x) => {
    let res_prices = GetYForX(
      clamped_x,
      width,
      chartData,
      height,
      ySearch ?? "binarySearchWithInterpolation"
    );
    y_pos.value = res_prices.y_coord;

    price_animated_val.value = withTiming(res_prices.real_price, {
      duration: 100,
    });
  };

  const pan = Gesture.Pan().onUpdate((evt) => {
    "worklet";
    const raw_x = Number(evt.x);
    const clamped = Math.max(x_range_min, Math.min(x_range_max, raw_x));
    x_pos.value = clamped;

    runOnJS(updateY)(clamped);
  });

  if (!chartData || chartData.length === 0) {
    return null; // or a fallback view in future , maybe :)
  }

  return (
    <View style={styles.home__main}>
      <StockHeader />

      <Text style={styles.home__price}>${priceText}</Text>

      <GestureDetector gesture={pan}>
        <Canvas
          style={{
            width: width,
            height: height,
          }}
        >
          <Cursor x_pos={x_pos} y_pos={y_pos} />

          {skpath && (
            <Path
              path={skpath}
              style="stroke"
              strokeWidth={strokeWidth}
              color={"#fff"}
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

      <PeriodBar />

      <StockInfo />
    </View>
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
    color: "#ffffab",
    fontSize: 52,
  },
  home__percent: {
    color: "#b7b7b7ff",
    fontSize: 28,
    marginTop: 15,
  },
});
