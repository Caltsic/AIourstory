// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<
  SymbolViewProps["name"],
  ComponentProps<typeof MaterialIcons>["name"]
>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.left": "chevron-left",
  "chevron.right": "chevron-right",
  "book.fill": "menu-book",
  "plus.circle.fill": "add-circle",
  plus: "add",
  "gearshape.fill": "settings",
  "play.fill": "play-arrow",
  xmark: "close",
  "xmark.circle": "cancel",
  "arrow.left": "arrow-back",
  "trash.fill": "delete",
  trash: "delete-outline",
  "clock.fill": "access-time",
  "text.bubble.fill": "chat",
  "doc.text.fill": "description",
  "doc.text": "description",
  "checkmark.circle.fill": "check-circle",
  "checkmark.circle": "check-circle-outline",
  checkmark: "check",
  photo: "photo",
  pencil: "edit",
  dice: "casino",
  "person.fill": "person",
  "person.2.fill": "groups",
  "photo.on.rectangle": "photo-library",
  "list.bullet": "format-list-bulleted",
  ellipsis: "more-horiz",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <MaterialIcons
      color={color}
      size={size}
      name={MAPPING[name]}
      style={style}
    />
  );
}
