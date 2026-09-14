import { Text, View } from "@pocketjs/framework/octane/components";

// PicoView product shell skeleton (ROADMAP V0).
//
// Deliberately empty of viewer function: no decoder, no image requests, no
// experiment harness. It exists so the PocketJS app bundle → PicoView TSX →
// normal product shell path has a clean starting point. Viewer slices
// (Open, View, Browse, …) are sequenced in docs/ROADMAP.md.
export default function App() {
  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <Text class="text-sm text-white font-bold">PicoView</Text>
      </View>
      <View class="flex-1 flex-col items-center justify-center bg-slate-800">
        <Text class="text-sm text-slate-400">No image open</Text>
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700">
        <Text class="text-xs text-slate-500">Ready</Text>
      </View>
    </View>
  );
}
