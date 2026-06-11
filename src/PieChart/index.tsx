import { View, Text, StyleSheet } from "react-native";
import React, { useState } from "react";
import { arc, pie } from "d3-shape";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas, Group, Path } from "@shopify/react-native-skia";
import { PieDataPoint, PieProps } from "./types";

const PieChart = ({
  width,
  height,
  data ,
  donut = false,
  innerRadiusRatio = 0.9,
  labelBgColor = "#333",
  labelFontColor = "#fff",
}: PieProps): React.ReactElement => {
  // show label above the selected region on the chart
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Derive center and radius from width/height — caller never needs to think about this.
  // 0.85 leaves breathing room so slices don't clip at the edges.
  // When donut is added: innerRadius = outerRadius * innerRadiusRatio, nothing else changes.
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = (Math.min(width, height) / 2) * 0.85;
  const innerRadius = donut ? outerRadius * innerRadiusRatio : 0;

  // now move ahead to calculate the total and individual arcs
  const total = data.reduce((sum, curr) => sum + curr.value, 0);

  // d3-pie: converts raw values into arc angle descriptors { startAngle, endAngle }
  const pieGenerator = pie<PieDataPoint>()
    .value((d) => d.value)
    .sort(null); // preserve data order, dont sort by default

  const arcs = pieGenerator(data);
  // arcs is of type {data, value, index, startAngle, endAngle, padAngle}[]

  // d3-arc: converts { startAngle, endAngle } into an SVG path string
  const arcGenerator = arc<(typeof arcs)[number]>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);

  // Active slice gets a slightly larger radius to pop out on tap
  const activeArcGenerator = arc<(typeof arcs)[number]>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius * 1.07);

  // Tap gesture: determine which slice was tapped via angle lookup
  const tap = Gesture.Tap()
    // this part runs on js
    // TODO : this runs on js, can we shift to ui thread?
    // however pie charts wont have too much data, so not an urgent thing to do
    .runOnJS(true)
    .onStart((g) => {
      const dx = g.x - cx;
      const dy = g.y - cy;

      // now use distance formula to get distance from center
      // used to decide whether to toggle active or in-active
      const dist = Math.sqrt(dx * dx + dy * dy);
      // if clicked outside or on the inner region, toggle "off" the active selection, unselect it
      if (dist > outerRadius || dist < innerRadius) {
        setActiveIndex(null);
        return;
      }

      // main idea : tan(w) =  dy/dx
      // so w = arctan(dy/dx)
      // Math.atan2 gives angle from positive x-axis in [-π, π]
      // d3-pie uses angles from 12 o'clock (top/y-axis), clockwise
      // so we rotate the calculated angle 'w' by -π/2
      // then normalise the new 'w' to [0, 2π] range to match it to d3-pie's angle conventions
      let angle = Math.atan2(dy, dx);
      // add pi/2
      angle += Math.PI / 2;

      // normalise
      if (angle < 0) angle += 2 * Math.PI;

      const tappedIndex = arcs.findIndex(
        (arc) => angle >= arc.startAngle && angle <= arc.endAngle,
      );

      // if already selected, tapping again would un-select it
      setActiveIndex(activeIndex === tappedIndex ? null : tappedIndex);

      console.log(tappedIndex)
    });

  // For the label bubble: compute the centroid (visual centre) of the active slice
  const getActiveCentroid = (): [number, number] | null => {
    if (activeIndex === null) return null;
    const activeArc = arcs[activeIndex];
    if (!activeArc) return null;
    const [x, y] = activeArcGenerator.centroid(activeArc);
    return [cx + x, cy + y];
  };

  const centroid = getActiveCentroid();
  // remember, we didnt sort, so index in the arcs[] is same as index in data[]
  const activeItem = activeIndex !== null ? data[activeIndex] : null;
  const percentage = activeItem
    ? ((activeItem.value / total) * 100).toFixed(1)
    : null;

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={tap}>
        <View style={{ width, height }}>
          <Canvas style={StyleSheet.absoluteFill}>
            {/* Translate the group so (0,0) is the chart center — all arc coords are relative to center */}
            <Group transform={[{ translateX: cx }, { translateY: cy }]}>
              {arcs.map((arcDatum, index) => {
                const isActive = activeIndex === index;
                const generator = isActive ? activeArcGenerator : arcGenerator;
                const pathStr = generator(arcDatum) ?? "";

                return (
                  <Path
                    key={`slice-${index}`}
                    path={pathStr}
                    color={data[index].color}
                    style="fill"
                  />
                );
              })}
            </Group>
          </Canvas>

          {/* Label bubble — positioned over the active slice's centroid */}
          {centroid && activeItem && (
            <View
              pointerEvents="none"
              style={[
                styles.labelBubble,
                {
                  backgroundColor: labelBgColor,
                  // centroid gives us the visual centre of the slice
                  // subtract half the bubble's approx size to centre it
                  left: centroid[0] - 40,
                  top: centroid[1] - 22,
                },
              ]}
            >
              <Text style={[styles.labelText, { color: labelFontColor }]}>
                {activeItem.label}
              </Text>
              <Text style={[styles.valueText, { color: labelFontColor }]}>
                {activeItem.value} ({percentage}%)
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  labelBubble: {
    position: "absolute",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
    zIndex: 10,
    elevation: 4,
    minWidth: 80,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  valueText: {
    fontSize: 10,
    marginTop: 1,
  },
});

export default PieChart;
