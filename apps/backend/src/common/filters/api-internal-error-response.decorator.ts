import { applyDecorators } from '@nestjs/common';
import { ApiInternalServerErrorResponse } from '@nestjs/swagger';

import { ApiErrorResponseDto } from './api-error-response.dto';

/**
 * The one phrasing for the internal surface's 500, so nine controllers cannot
 * hold nine slightly different accounts of the same masking behaviour.
 *
 * Every clause is a fact about {@link HttpExceptionFilter}, not a house style:
 * its ≥500 arm replaces the message with a generic `Internal server error` and
 * puts `exception.name` in `error` (a plain thrown `Error` becomes
 * `InternalServerErrorException`). So `error` is a class name — informative,
 * but not a value to branch on — which is precisely what this text tells a
 * caller.
 */
export const INTERNAL_ERROR_DESCRIPTION =
  'Something failed on our side. The message is masked to a generic `Internal server error` and ' +
  '`error` carries the exception class name — this surface publishes no closed error enum, so branch ' +
  'on the status rather than the value. Correlate with the `traceId` in the body.';

export interface ApiInternalErrorResponseOptions {
  /**
   * Appended to {@link INTERNAL_ERROR_DESCRIPTION} for a route whose 500 needs
   * something said about it that the shared sentence cannot say — in practice,
   * what is NOT a 500 here. `HealthController` is the precedent and the reason
   * this option exists: a database failure on the probe is a 200 carrying
   * `status: "degraded"`, and an infrastructure consumer that assumed otherwise
   * would pull a healthy process out of rotation.
   *
   * NOT a place to re-describe the masking. Anything that is true of every
   * internal 500 belongs in the shared constant, where every route gets it.
   */
  readonly note?: string;
}

/**
 * Publish the 500 an internal controller can always return.
 *
 * WHY THIS EXISTS AT ALL: NOTHING OWNS THE 500, SO EVERY CONTROLLER FORGOT IT.
 * `backend.agents.md` § "API contract" requires every reachable status be
 * documented, and `HttpExceptionFilter` normalizes ANY unhandled failure — a
 * global guard's, an interceptor's, a service's, a controller's — to 500. That
 * makes one reachable from every route without any of them declaring it, which
 * is exactly the shape of omission that survives review: nobody wrote the bug,
 * so nobody sees it.
 *
 * This decorator publishes that 500 for every controller at once, typed with
 * the base {@link ApiErrorResponseDto} — this surface promises no closed error
 * enum, so the envelope is the whole contract.
 *
 * APPLIED AT CLASS LEVEL, not per route. Nest merges a controller's
 * `@ApiResponse` metadata into every one of its handlers, so a class-level
 * application is what makes the 500 impossible for a NEW route on an existing
 * controller to forget — the failure mode this sweep is closing.
 *
 * AND IT IS NOT OPTIONAL ON THE GROUND THAT A HANDLER CANNOT THROW.
 * `HealthController` has no throwing path of its own — it catches its only I/O
 * failure and reports it in the body — and it still publishes the 500, because
 * the enhancers around it can fail and the filter answers the same way. An
 * omission and a deliberate absence must not look the same in a published
 * contract; that indistinguishability is what let the gap survive three epics,
 * so there is no "cannot reach one" arm to choose. Use {@link
 * ApiInternalErrorResponseOptions.note} to say what a 500 is not.
 */
export const ApiInternalErrorResponse = ({
  note,
}: ApiInternalErrorResponseOptions = {}): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiInternalServerErrorResponse({
      description:
        note === undefined ? INTERNAL_ERROR_DESCRIPTION : `${INTERNAL_ERROR_DESCRIPTION} ${note}`,
      type: ApiErrorResponseDto,
    }),
  );
