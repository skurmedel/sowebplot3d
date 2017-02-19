describe("RealVector", function() {
    const RV = RealVector;

    describe("constructor", function(){
        it("should fail if inputs is empty.", function() {
            expect(() => new RV()).to.throwException(RangeError);
        });
        it("should fail if a value is not float convertible", function() {
            expect(() => new RV("abc", 2)).to.throwException(TypeError);
        });
        it("should succeed if all inputs are valid and dims correct.", function() {
            let v = new RV(1, 2, 3, 4.1);
            expect(v.dims).to.be(4);
            expect(v.at(0)).to.be(1);
            expect(v.at(1)).to.be(2);
            expect(v.at(2)).to.be(3);
            expect(v.at(3)).to.be(4.1);
        });
    });

    describe("toString", function(){
        it("should return as string of (x, y, z)", function () {
            let v = new RV(1,2,3);
            expect(v.toString()).to.be("(1, 2, 3)");
        });
    });

});


describe("RealValuedFunction", function () { 
    const RVF = RealValuedFunction;
    
    describe("constructor", function() {
        it("should fail if vars is not an array of strings.", function() {
            expect(function () { new RVF([1,2,3], "x") }).to.throwException(TypeError);
        });
        it("should fail if a var is not in expr.", function() {
            expect(function () { new RVF(["x"], "y")}).to.throwException(ReferenceError);
        });
    });

    describe("evalAt", function() {

        it("should return the value of f at x", function() {
            let f = new RVF(["x"], "2*x");
            expect(f.evalAt(1)).to.be(2);
        });

        it("should return the value of f at u, v", function() {
            let f = new RVF(["u", "v"], "u * v");
            expect(f.evalAt(2, 2)).to.be(4);
        });

        it("should return infinity for 1/0", function() {
            let f = new RVF(["u"], "1/u");
            expect(f.evalAt(0)).to.be(Infinity);
        });

    });

    describe("gradientAt", function() {
        it("should return a RealVector of f at x, y, z", function() {
            let f = new RVF(["x", "y", "z"], "2*x + 2*y + 2 * z * z");
            let v = f.gradientAt(1, 2, 1);

            expect(v instanceof RealVector).to.be.ok();

            expect(Math.abs(v.at(0) - 2) < 0.00001).to.be.ok();
            expect(Math.abs(v.at(1) - 2) < 0.00001).to.be.ok();
            expect(Math.abs(v.at(2) - 4) < 0.00001).to.be.ok();
        });

        it("should fail if the params are more or less than the definition.", function() {
            let f = new RVF(["x", "y", "z"], "2*x + 2*y + 2 * z * z");
            expect(()=>f.gradientAt(1,1,1)).to.not.throwException();
            expect(()=>f.gradientAt(2,3)).to.throwException((e)=>expect(e).to.be.a(RangeError));
            expect(()=>f.gradientAt(2,3,4,4)).to.throwException((e)=>expect(e).to.be.a(RangeError));
        });
    });
});