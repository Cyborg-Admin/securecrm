"use client";

import { useId } from "react";

type Props = {
  className?: string;
  size?: number;
  title?: string;
};

/** KINETIC brand mark — angular K with forward motion trails. */
export function KineticEmblem({
  className,
  size = 36,
  title = "KINETIC",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const gradId = `kineticKFill-${uid}`;
  const titleId = `kinetic-emblem-title-${uid}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient
          id={gradId}
          x1="10"
          y1="8"
          x2="54"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#109572" />
          <stop offset="1" stopColor="#0A5C48" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#D7EFE6" />
      <path
        d="M38 18h16"
        stroke="#0D7A5F"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".35"
      />
      <path
        d="M42 32h14"
        stroke="#0D7A5F"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".55"
      />
      <path
        d="M38 46h16"
        stroke="#0D7A5F"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".35"
      />
      <path
        d="M18 14v36M18 32l22-18M18 32l22 18"
        stroke={`url(#${gradId})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="32" r="3.2" fill="#0A5C48" />
    </svg>
  );
}
