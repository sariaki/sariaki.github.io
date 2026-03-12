---
title: "PoP: A novel approach to resistant control flow obfuscation"
---
# Probabilistic Opaque Predicates Against Symbolic Execution

## Introduction
I spent the past ~7 months coming up with different creative ideas for a national research/science fair competition in Germany ("Jugend forscht"). After being inspired by Brit from secret.club, I ultimately ended up right back at home where I had begun years prior -- Reverse Engineering/Game hacking.
The following post seeks to explain a novel approach to control flow obfuscation implemented on and off these past months as an LLVM-pass.

For those lucky enough to understand German, a ca. 15 page paper which goes into more depth as well as an LLVM-based implementation of the idea can be found here: **https://github.com/sariaki/JuFo-2026**

## Prerequisites
### Opaque Predicates
For the sake of brevity, only invariant opaque predicates will be introduced: These are a type of control flow obfuscation which work by inserting branching conditions where, for any given input, the same branch is always taken. I.e: No matter what, the program behavior stays the same while appearing more complex.
<p align="center">
  <img src="/posts/img/OP.png"/>
  <p align="center">An example of an opaque predicate.</p>
</p>

### Symbolic Execution
Imagine trying to prove that the above opaque predicate is actually opaque so that you can remove it as well as its branch B which is never taken. You might:
1. Execute it for all possible inputs and checking if the taken branch stays the same
2. Execute it for some random inputs and checking if the taken branch stays the same
3. Try mathematically proving that the predicates evaluates to true for all inputs

Let's go over the options:
Option 1 fails. Even with just one 64 bit integer $x$, one would already have to bruteforce $2^{64}$ different possibilities. This is practically infeasable.

What if, instead, we use option 2 and evaluate the predicate for a set of random inputs to prove with a high certainty that the predicate is opaque? By only probabilistically proving correctness, the search space becomes feasable.
The problem with this method lies in its high rate of false positives between ~20% and ~40% [^1]. Allthough it may remove all opaque predidicates from an obfuscated binary, valuable legitimate code will be lost as well.

This leaves us with option 3. For this, one would have to show that $\forall x \in \mathbb{R} : 2 | x \cdot (x+1)$.
Here's what that would look like informally: (1) any even number multiplied by an odd number is always even. (2) if $x$ is even, $x \cdot (x+1)$ must be even by (1). (3) if $x$ is odd, $x \cdot (x+1)$ must also be even since $x+1$ must be odd and (1) still applies $\square$.
This works, but obviously doesn't scale. Imagine spending that time for every different opaque predicate in a binary with thousands...

Symbolic execution fixes this by practically automating the last option detailed. In short, it lifts the predicates underlying binary code into a higher level *more mathy* representation which in turn allows for an SMT-solver to automatically prove statements about the underlying code. Implementations such as those featured in angr, triton, miasm and binsec differ slightly but all ultimately boil down to this.

## Motivation
Current SOTA opaque predicates aimed to defeat symbolic execution currently either fail to resist symbolic execution based attacks or are simply to slow / easily identifyable. Considering that so many obfuscators implement opaque predicates to be paired with other obfuscation methods, this issue becomes relevant.
Below is an (incomplete) general overview of some currently used types of opaque predicates:
- Bi-Opaque Predicates attack the practical weaknesses of symbollic execution engines by using functions, instructions etc. unmodelled/not modelled correctly by them. With projects such as *angr* continuously improving, these opaque predicates have a practical expiry date when deployed [^biop]. 
- Other opaque predicates use currently unsolved problems (e.g. the [Collatz conjecture](https://en.wikipedia.org/wiki/Collatz_conjecture)) [^linear].
- Alternatively, some use computationally hard problems (e.g. require an attacker to simplify *mixed boolean arithmetic* expressions) [^mba].

## Idea
Consider the following Monte-Carlo-Algorithm:
```python
def foo():
  X = rand(0, 1)
  if X <= 0.9999999999999:
    return 1
  return 0
```
If you were to symbolically execute `foo`'s predicate, the symbolic execution engine would tell you that both branches are plausible.
Herein lies the problem with symbolic execution: Probabilistic algorithms simply don't map nicely to statements which can be proven for some constraints.

This problem forms the basis of what i call **probabilistic opaque predicates**, or **POPs** for short: Instead of creating predicates which always evaluate to the same value, we create predicates that are extremely likely to always evaluate to the same value. Throught this, symbolic execution engines fail to differenciate our POPs from regular predicates and thus can't flag them.

### Construction
Using uniformly distributed (pseudo-)random variables in our opaque predicates would allow reverse engineers to easily understand which branch is practically taken. To make this more difficult, I've created an algorithm which generates a new random probability distribution for each POP. Here's the summary:

Let $f(x, y, z, ...)$ be the function we're trying to obfuscate.

1. First, we create a statically indeterminate symbolic variable for the solver. Traditionally, existing implementations would simple use a random argument of $f$ to achieve this. However, for functions only ever called with constant parameters, this becomes an issue: an attacker could simple execute all function predicates with every possible input that comes up in the binary to check if the same branch is always taken.
To combat this, I created a DFS-algorithm which walks the use-def chain to find out if the parameter is actually statically indeterminate, i.e. doesn't just have concrete values associated with it. This is the case if any assignment of our parameter $x$ depends on an external function/global or similar -- anything that can't be reduced to a small set of possible values.

<p align="center">
  <img src="/posts/img/use-def chain tree.png" width=300rem//>
  <p align="center">An example for a use-def chain tree. The highlighted nodes show a path from our parameter to an undefined external value.</p>
</p>

2. By generating Bernstein polynomials $B_n(x)$ with monotonically increasing coefficients, $c_0 \le c_1 \le \cdots \leq c_n$, we create functions which fulfill the axioms of cumulative distribution functions (CDFs) $P(X \leq x)$:
$$B_n(x) = \sum_{k=0}^n c_k \binom{n}{k} x^k (1-x)^{n-k}$$

<p align="center">
  <img src="/posts/img/bernstein.jpg" width=300rem/>
  <p align="center">Some Bernstein polynomials. Taken from my paper -- excuse the German text.</p>
</p>

3. By computing the inverse of our CDF $x:=B_n^{-1}(x)$ [^2] with our symbolic variable $x$, our output $x$ is distributed the same as $B_n(x)$'s underlying probability density function (PDF). This is known as the inverse transform method [^3]

<p align="center">
  <img src="/posts/img/cdf_inv_exp.jpg" width=300rem/>
  <p align="center">An example for computing the inverse of a CDF, in this case of the exponential distribution.</p>
</p>

4. Since we control the CDF, we can chose what value-ranges of our new variable $x$ are probable/improbable and make probable/improbable statements based on that information.

<figure>
  <img src="/posts/img/discrete.svg" width=300rem/>
  <figcaption>(a) A discretely distributed random variable.</figcaption>
  <img src="/posts/img/pdf.svg" width=300rem/>
  <figcaption>(b) A continuously distributed random variable.</figcaption>
</figure>

This, of course, also works for discrete distributions if we just treat the random variable accordingly.

## Benchmarks
All benchmarks were performed using clang 18.1.3 with `-O3` and Ubuntu 24.04.3 LTS with kernel version 5.16 as well as an Intel&#174; Core&#8482; i7-10700F CPU and 16Gb of DDR4 RAM. 31 Programs from the LLVM Test Suite [^4] were tested 5 times. The POPs had an assigned probability of failing of 0.000001%.
<figure>
  <img src="/posts/img/benchmarks/pass_rate.png" width=300rem/>
  <figcaption>(a) The pass rate stays at 100%, no matter how many functions are obfuscated.</figcaption>
  <img src="/posts/img/benchmarks/compilation_time.png" width=300rem/>
  <figcaption>(b) The pass adds linearly increasing compile-time costs the more functions are obfuscated.</figcaption>
</figure>

During the presentations I've held before friends as well as others interested, I often get asked about whether the obfuscated programs produced fail in practice -- after all, the theoretical probability of it happening is $>0$. Based on my tests, I can confidentely say that this doesn't happen. All tests built by competent compiler engineers smarter than me for checking if program semantics stay intact continue to pass.

<figure>
  <img src="/posts/img/benchmarks/runtime.png" width=300rem/>
  <figcaption>(a) Runtime costs rise with more functions obfuscated.</figcaption>
  <img src="/posts/img/benchmarks/size.png" width=300rem/>
  <figcaption>(b) Program size rises with more functions obfuscated.</figcaption>
</figure>

As is to be expected, runtime costs and program size increase with more obfuscation applied. The median runtime performance of a binary with 100% of all functions obfuscated is ~15% slower than its unobfuscated counterpart. The median program size with all functions obfuscated rises by ~25%. For most use cases, this should be fine. A bigger problem might be that the distance between the upper and lower quartiles is fairly large. For instace: With 100% of functions obfuscated, the slowest 25% of programs were more than two times as slow as they were unobfuscated. The same goes for their size. This might seem dramatic at first glance but can be explained by some of the programs' sizes being relatively small: Since our POPs don't change size relative to the programs, they'll obviously have a larger impact on smaller ones.
As you might have seen, in some rare cases, the programs are actually *faster* post obfuscation. 
<!-- This might be explained by the branch predictor failing less on our POPs which de facto always branch the same -- I'll be looking into this more to be sure though once I get the time. -->The most likely reasons for this lie in proprietary microarchitectual optimizations (e.g. more efficient branch prediction) in the test devices used during the evaluation.

<p align="center">
  <img src="/posts/img/benchmarks/stealth.png" width=400rem/>
  <p align="center">The distance of vectors describing the last 10 instructions of predicates to the average of all regular predicates for POPs and regular predicates.</p>
</p>

I won't go into detail about how I measured stealth here, allthough I found it to be quite interesting. The important part is that the main shortcoming POPs face is that they're statistically detectable when categorizing the last 10 instructions before the jump. This can be traced back to the plethora of floating point instructions POPs use at once which might seem uncommon depending on the program. This is bad since once an attacker realises that a predicate is actually a POP, they can simply execute it once to find the right path and remove the POP. 
<!-- To combat this, users should as of right now pair the control flow obfuscation detailed with a FP junk code insertion pass. -->
I'm currently working on a pass to insert false floating point dependencies into regular branches to combat this.

## Conclusion
In summary, probabilistic opaque predicates provide a novel way to combat opaque predicates' main weakness: symbolic execution. 
When configured/paired correctly, they're strong against attackers, resilient against symbolic execution as well as stealthy -- all whilst producing acceptable costs in performance/program sizes. 

I hope that this brief post shows how fun (and creative!) (de-)obfuscation can be and motivates readers to develop new methods to attack POPs as well as to use this for inspiration to maybe even devlop their own obfuscation methods.
Although I spent tons of time on this which I could've more efficiently allocated towards studying for the German finals, I'm happy with what I created and hope for others to find it equally as useful and interesting.

**Incase you have any questions or feel like reaching out: My Discord is @sariaki** (uid 671779079363624970)

<!-- Also: I'm now enlightened enough to reconize just how horrible using images in LaTeX really is. Not-Matthias tried to warn me, but I didn't listen. I'm using typst next time I can. -->

[^1]: cf. *Opaque Predicates Detection by Abstract Interpretation*, 2006 by Preda et al.

[^2]: I used the Newton-Raphson method to do this efficiently.

[^3]: https://statproofbook.github.io/P/cdf-itm.html

[^4]: https://llvm.org/docs/TestSuiteGuide.html

[^biop]: cf. *Manufacturing Resilient Bi-Opaque Predicates Against Symbolic Execution*, 2018 by Xu et al.

[^linear]: cf. *Linear Obfuscation to Combat Symbolic Execution*, 2011 by Wang et al.

[^mba]: https://plzin.github.io/posts/mba