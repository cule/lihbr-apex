<!-- HEALTH:HIGH simple-button -->
<template>
  <component
    :is="tag"
    class="simpleButton h-8 flex justify-center rounded px-3 border-2 fill-current cursor-pointer duration-base ease-base select-none font-bold text-s"
    :class="{ disabled }"
    :disabled="tag === 'button' && disabled"
    :aria-disabled="tag !== 'button' && disabled"
  >
    <span class="wrapper self-stretch flex items-center">
      <slot />
    </span>
  </component>
</template>

<script>
export default {
  props: {
    tag: {
      type: String,
      default: "button"
    },
    disabled: {
      type: Boolean,
      default: false
    }
  }
};
</script>

<style lang="sass" scoped>
.simpleButton
  transition-property: background, opacity

  &:not(:hover):not(:focus)
    @apply bg-transparent #{!important}

  &:hover, &:focus
    @apply duration-1/2 outline-none

    .wrapper
      @apply text-white transition-color duration-1/2 ease-base

  &.disabled
    @apply pointer-events-none opacity-50
</style>
