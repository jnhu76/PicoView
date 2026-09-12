import { useState } from "octane";
import { Text, View } from "@pocketjs/framework/octane/components";

// PicoView A1 architecture proof guest.
// Minimal viewer-shaped Octane surface: top chrome, image viewport placeholder,
// bottom status bar with controls. No actual image decode or viewer logic.

const TopChrome = (props: { title: string; status: string }) => {
  return (
    <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
      <View class="flex-row items-center gap-3">
        <Text class="text-sm text-white font-bold">{props.title}</Text>
      </View>
      <View class="flex-row items-center gap-4">
        <Text class="text-xs text-slate-400">{props.status}</Text>
      </View>
    </View>
  );
};

const ImageViewport = (props: { width: number; height: number; placeholder: string }) => {
  return (
    <View class="flex-1 items-center justify-center bg-slate-800">
      <View class="flex-col items-center gap-2">
        <View class="w-16 h-16 rounded-lg bg-slate-700 border border-slate-600" />
        <Text class="text-xs text-slate-500">{props.placeholder}</Text>
        <Text class="text-xs text-slate-600">{`${props.width} x ${props.height}`}</Text>
      </View>
    </View>
  );
};

const StatusBar = (props: { zoom: string; info: string }) => {
  return (
    <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700">
      <Text class="text-xs text-slate-400">{props.info}</Text>
      <View class="flex-row items-center gap-3">
        <Text class="text-xs text-slate-500">{props.zoom}</Text>
        <View class="px-2 py-0.5 rounded bg-slate-700">
          <Text class="text-xs text-slate-300">Fit</Text>
        </View>
        <View class="px-2 py-0.5 rounded bg-slate-700">
          <Text class="text-xs text-slate-300">100%</Text>
        </View>
      </View>
    </View>
  );
};

export default function PicoViewGuest() {
  const [zoom] = useState("Fit");
  return (
    <View class="w-full h-full flex-col bg-slate-800">
      <TopChrome title="PicoView" status="Architecture A1 Proof" />
      <ImageViewport width={720} height={480} placeholder="Image viewport placeholder" />
      <StatusBar zoom={zoom} info="No image loaded" />
    </View>
  );
}
