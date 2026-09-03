export const TAG_COLOR_OPTIONS = [
  { name: "雾蓝", value: "#5F7FA9" },
  { name: "鼠尾草", value: "#608575" },
  { name: "珊瑚粉", value: "#A56E65" },
  { name: "雾紫", value: "#7B719B" },
  { name: "藕粉", value: "#9B6D80" },
  { name: "暖沙", value: "#95754F" },
  { name: "灰青", value: "#547E82" },
  { name: "靛灰", value: "#66758F" },
  { name: "柔橄榄", value: "#7B815C" },
  { name: "莓灰", value: "#8E6E91" },
] as const;

export const TAG_COLOR_VALUES = TAG_COLOR_OPTIONS.map(
  (option) => option.value,
);
