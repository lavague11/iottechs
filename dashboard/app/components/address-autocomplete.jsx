"use client";

import { useEffect, useRef } from "react";
import { attachAutocomplete } from "../../lib/places";

// The one address / business autocomplete input for the whole app. Wraps the shared, race-safe
// lib/places loader so every intake form behaves identically (and the loading=async fix applies
// everywhere at once). Value-controlled:
//
//   <AddressAutocomplete value={addr} onChange={setAddr} />                         // address field
//   <AddressAutocomplete types={["establishment"]} value={co} onChange={setCo}      // business search →
//       onPlace={(p) => { setCo(p.name); setAddr(p.address); }} />                  //   fills name + address
//
// If `onPlace` is provided it fully handles a picked place; otherwise the picked address flows to
// `onChange`. Any extra props (type, required, style, id, …) pass straight through to the <input>.
export default function AddressAutocomplete({
  value = "",
  onChange,
  onPlace,
  types = ["address"],
  className,
  placeholder,
  ...rest
}) {
  const ref = useRef(null);
  // Keep the callbacks in refs so a parent re-render never re-runs the attach effect.
  const onChangeRef = useRef(onChange);
  const onPlaceRef = useRef(onPlace);
  onChangeRef.current = onChange;
  onPlaceRef.current = onPlace;

  const typesKey = JSON.stringify(types);
  useEffect(() => {
    return attachAutocomplete(ref.current, {
      types,
      onPlace: (p) => {
        if (onPlaceRef.current) onPlaceRef.current(p);
        else onChangeRef.current?.(p.address || p.name || "");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey]);

  return (
    <input
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChangeRef.current?.(e.target.value)}
      {...rest}
    />
  );
}
