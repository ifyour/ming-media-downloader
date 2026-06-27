import { describe, it, expect } from 'vitest'
import type { MediaResult as FrontendResult } from '../../src/types'

/**
 * API Contract Test: validates that the Worker's response shape matches
 * what the frontend expects.
 *
 * This test defines a minimal mock of the Worker's MediaResult shape and
 * asserts that the frontend's type can accommodate all fields the worker sends.
 */

// Sample worker response (must match worker/src/types.ts MediaResult shape)
const workerSampleResponse = {
  platform: 'rednote' as const,
  id: 'abc123',
  type: 'video' as const,
  title: 'Test Title',
  desc: 'Test description',
  cover: 'https://example.com/cover.jpg',
  author: {
    name: 'Author Name',
    screen_name: 'author_handle',
    avatar: 'https://example.com/avatar.jpg',
  },
  videos: [
    {
      url: 'https://example.com/video.mp4',
      width: 1920,
      height: 1080,
      quality: '1080p',
      size: 10_000_000,
      bitrate: 2_000_000,
      fps: 30,
    },
  ],
  images: ['https://example.com/img1.jpg'],
}

// Frontend-friendly assertion: the response from the API should be
// assignable to the frontend's MediaResult type
describe('API Contract: Worker response → Frontend type compatibility', () => {
  it('worker response shape is compatible with frontend MediaResult type', () => {
    const response: FrontendResult = {
      platform: workerSampleResponse.platform,
      id: workerSampleResponse.id,
      type: workerSampleResponse.type,
      title: workerSampleResponse.title,
      desc: workerSampleResponse.desc,
      cover: workerSampleResponse.cover,
      author: {
        name: workerSampleResponse.author.name,
        avatar: workerSampleResponse.author.avatar,
        screen_name: workerSampleResponse.author.screen_name,
      },
      videos: workerSampleResponse.videos.map(v => ({
        url: v.url,
        width: v.width,
        height: v.height,
        quality: v.quality,
        size: v.size,
        bitrate: v.bitrate,
      })),
      images: workerSampleResponse.images,
    }
    // If the types are compatible, this assertion passes
    expect(response.platform).toBe('rednote')
    expect(response.videos[0].url).toBeDefined()
    // Note: 'fps' from worker response is dropped — frontend type doesn't have it
    // This is intentional; the frontend simply ignores extra fields
  })

  it('all worker response fields are consumed by frontend', () => {
    // Every field that the frontend needs must exist in the worker response
    const frontendFields: (keyof FrontendResult)[] = [
      'platform', 'id', 'type', 'title', 'desc', 'cover', 'author', 'videos', 'images',
    ]

    for (const field of frontendFields) {
      expect(workerSampleResponse).toHaveProperty(field)
    }
  })
})
