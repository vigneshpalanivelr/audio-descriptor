"use client"

import { useEffect, useRef } from "react"

interface WaveformProps {
  stream: MediaStream | null
  isActive: boolean
}

export function Waveform({ stream, isActive }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !stream || !isActive) return

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const canvasCtx = canvas.getContext("2d")!

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const { width, height } = canvas!
      canvasCtx.clearRect(0, 0, width, height)
      canvasCtx.lineWidth = 2
      canvasCtx.strokeStyle = "currentColor"
      canvasCtx.beginPath()

      const sliceWidth = width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        // eslint-disable-next-line security/detect-object-injection -- Uint8Array with bounds-checked numeric loop index
        const v = dataArray[i]! / 128.0
        const y = (v * height) / 2
        if (i === 0) {
          canvasCtx.moveTo(x, y)
        } else {
          canvasCtx.lineTo(x, y)
        }
        x += sliceWidth
      }

      canvasCtx.lineTo(width, height / 2)
      canvasCtx.stroke()
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      audioCtx.close().catch(() => {})
    }
  }, [stream, isActive])

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={64}
      className="w-full h-16 opacity-80"
      aria-hidden="true"
    />
  )
}
